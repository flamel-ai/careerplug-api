# careerplug-api

Fully-typed TypeScript SDK for the **CareerPlug API**, generated from CareerPlug's live Swagger 2.0 document and converted to OpenAPI 3, with zod validation, OAuth 2.0 helpers, and a reader for the partner job-feed surface.

CareerPlug publishes no OpenAPI file, no SDK, and no endpoint reference outside a Swagger UI at a path search engines never index. This repo turns that into something you can regenerate, diff, and depend on.

```bash
pnpm add @flamel-ai/careerplug-api
```

---

## The three hosts

Almost every CareerPlug integration mistake traces back to conflating these.

| Host | Serves | Auth |
|---|---|---|
| `app.careerplug.com` | OAuth only (`/oauth/token`, `/oauth/authorize`) — Rails + Doorkeeper | client id/secret |
| `api.careerplug.com` | The v1 REST API + its docs — Ruby Grape + WineBouncer | `?access_token=` |
| `feed.careerplug.com` | Static partner job feeds (XML on S3/CloudFront) | **none** |

A quick way to tell which host you actually reached, when a request 404s:

- `{"error":"Unable to find endpoint"}` → you're on `api.careerplug.com`, wrong path
- `{"error":"not_found"}` → you're on `app.careerplug.com`, which has no API resources

---

## Quick start

### Job feeds (no credentials required)

If you want job data, this is very likely all you need. It involves no OAuth application at all.

```ts
import { fetchFeed } from "@flamel-ai/careerplug-api/feeds";

const { jobs, lastModified } = await fetchFeed("your-partner-slug", "your_feed_default");
console.log(jobs.length, jobs[0]?.title);

// Cheap polling: 304 means nothing changed.
const next = await fetchFeed("your-partner-slug", "your_feed_default", {
  ifModifiedSince: lastModified,
});
if (next.notModified) console.log("unchanged");
```

### The REST API (OAuth)

```ts
import { CareerPlugAuth, configureCareerPlug, getJobs } from "@flamel-ai/careerplug-api";

configureCareerPlug({
  auth: CareerPlugAuth.clientCredentials({
    clientId: process.env.CAREERPLUG_CLIENT_ID!,
    clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
  }),
});

const { data } = await getJobs({ query: { per_page: 50, postal_code: "78701" } });
```

The auth layer mints a token, caches it for its 48-hour life, collapses concurrent mints into one request, appends it as the `access_token` **query parameter**, and retries once with a fresh token on a 401.

> **Read [`docs/authentication.md`](docs/authentication.md) before you pick a grant type.** There is a known open issue with `client_credentials` — see [Known gaps](#known-gaps).

---

## Endpoints

All 13, exactly as the spec declares them. Note there is **no version prefix**: it is `/jobs`, not `/v1/jobs`.

| Operation | Method | Path |
|---|---|---|
| `getJobs` | GET | `/jobs` |
| `getJobsId` | GET | `/jobs/{id}` |
| `getLocations` | GET | `/locations` |
| `getLocationsId` | GET | `/locations/{id}` |
| `getBrands` | GET | `/brands` |
| `getDepartments` | GET | `/departments` |
| `getEmployments` | GET | `/employments` |
| `getUsers` | GET | `/users` |
| `getUsersId` | GET | `/users/{id}` |
| `postUsersReset` | POST | `/users/reset` |
| `putUsersResetId` | PUT | `/users/reset/{id}` |
| `getApps` | GET | `/apps` |
| `postApps` | POST | `/apps` |
| `getAppsId` | GET | `/apps/{id}` |

"Apps" means **applications** in the ATS sense — job applicants — not OAuth applications.

Every collection accepts `page`, `per_page`, `aggregate`, `account_id`, and `account_class_ids[]`. `/jobs` additionally accepts `search`, `postal_code`, `postal_code_radius`, `employment_id`, `location_id`, `department_id`, and `brand_id`.

Full parameter and model detail: [`docs/endpoints.md`](docs/endpoints.md) and [`specs/openapi.json`](specs/openapi.json).

---

## Regenerating

The spec is fetched from the live API, which serves it **unauthenticated** — so anyone can reproduce this repo end to end, no credentials involved.

```bash
pnpm fetch-spec   # pull the live Swagger 2.0 doc into specs/
pnpm generate     # normalize -> OpenAPI 3 -> typed SDK in src/generated/
pnpm refresh      # both
```

| Path | What it is |
|---|---|
| `specs/swagger_doc.json` | **Untouched** upstream Swagger 2.0, byte-for-byte as served |
| `specs/resources/*.json` | Per-resource views (the Swagger UI "tabs"), vendored for drift detection |
| `specs/openapi.json` | The converted, corrected OpenAPI 3 document — a published artifact |
| `src/generated/` | Generated types, zod schemas, and SDK (committed, so it's readable on GitHub) |

Other stacks can generate their own client straight from the OpenAPI file:

```ts
import openapi from "@flamel-ai/careerplug-api/specs/openapi.json";
```

### What the normalizer fixes

Upstream defects are corrected in the **spec**, never by patching generated output, so the types, zod schemas, and SDK all come out right and the vendored upstream copy stays pristine. Each fix is pinned by a test in [`test/spec.test.ts`](test/spec.test.ts).

| Upstream defect | Consequence if unfixed | Fix |
|---|---|---|
| `host` set, but no `schemes`/`basePath` | Protocol-relative server URL, unusable in Node | Pin `https://api.careerplug.com` |
| Query arrays lack `collectionFormat` | Serialized `?ids[]=1,2` instead of `?ids[]=1&ids[]=2` — silently wrong results | `collectionFormat: multi` → `explode: true` |
| `default: null` on 7 integer params | Emits `z.int().default(null)`, which does not compile | Drop the key (no invented value) |
| Models named `V1_Entities_JobEntity` | TS types called `V1EntitiesJobEntity` | Rename to `Job`, `Location`, … and rewrite every `$ref` |
| OAuth flows entirely undeclared | No machine-readable way to discover how to get a token | Add `clientCredentials` + `authorizationCode`, pointed at the **OAuth** host |

One upstream oddity is deliberately **preserved**: `Location` has a property literally named `zip code`, with a space. That is genuinely what the API returns, so renaming it would be a lie.

---

## Known gaps

Stated plainly, because a client that looks complete but 401s is worse than one that tells you why.

**`client_credentials` tokens are rejected by every v1 endpoint.** Minting works and the token is valid (`/oauth/token/info` confirms `scope: ["global_partner_api"]`), but every resource endpoint answers:

```json
{"error":"OAuth error: WineBouncer::Errors::OAuthUnauthorizedError"}
```

This holds via both the query parameter and a bearer header. And `global_partner_api` is the **only** scope such an application may request — `public`, `partner_api`, `account_api`, `read`, `jobs`, `api`, and the empty string all return `invalid_scope`.

Working hypothesis, **not yet confirmed**: the v1 endpoints require a *resource-owner* token, and `client_credentials` produces one with `resource_owner_id: null`. If so, account data needs the `authorization_code` flow, which yields a user-scoped token plus a refresh token. `CareerPlugAuth.authorizationCode(...)` implements it; completing consent requires a logged-in CareerPlug administrator.

It may instead be a per-application provisioning setting. Either way the escalation path is the same: **TechAM@careerplug.com**.

**The feed surface cannot be enumerated.** S3 listing is off, so a directory path and a nonexistent feed both return 403. You must know the exact feed name; ask your partnerships contact.

---

## Docs

| | |
|---|---|
| [`docs/authentication.md`](docs/authentication.md) | Both grant types, the redirect-URI decision, token lifetimes, every error code |
| [`docs/endpoints.md`](docs/endpoints.md) | Full parameter and model reference |
| [`docs/job-feeds.md`](docs/job-feeds.md) | The feed surface, schema variants, polling |
| [`docs/upstream.md`](docs/upstream.md) | Where the spec comes from and how it was found |

## Development

```bash
pnpm install
pnpm typecheck
pnpm test              # 39 unit tests, no credentials needed
pnpm test:integration  # live round-trip; self-skips without credentials
pnpm build
```

## Security

This repository contains **no credentials**. `.env` is gitignored, integration tests read from the environment and skip when unset, and CI reads credentials only from repository secrets (which GitHub never exposes to fork pull requests).

Prefer sending client credentials in the POST **body** rather than the query string. CareerPlug accepts both, but query strings land in access logs, proxy logs, and browser history; request bodies do not. This SDK always uses the body.

## License

BSD-3-Clause. Not affiliated with or endorsed by CareerPlug.
