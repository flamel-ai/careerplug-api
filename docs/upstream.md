# Where the spec comes from

CareerPlug publishes no OpenAPI file, no SDK, and no endpoint reference on any documentation site. This page records where the machine-readable definition actually lives, so the next person does not repeat the search.

## The spec

| | |
|---|---|
| Swagger UI | `https://api.careerplug.com/docs` |
| **Machine-readable spec** | **`https://api.careerplug.com/swagger_doc`** (also `.json`) |
| Per-resource views | `https://api.careerplug.com/swagger_doc/<resource>` |

`/swagger_doc` is the [grape-swagger](https://github.com/ruby-grape/grape-swagger) convention. Both are served **unauthenticated**, which is what makes this repo regenerable by anyone.

The spec is **Swagger 2.0**, titled *"CareerPlug API Integration Documentation"*, version 1.0.0: 13 paths, 16 definitions.

## Dead ends, so nobody re-walks them

- `/openapi.json`, `/swagger.json`, `/docs.json`, `/swagger`, `/apidocs` — all 404
- `docs.` / `developers.` / `apidocs.` / `partners.careerplug.com` — CloudFront 403 or a wildcard catch-all
- `careerplug.stoplight.io` returns HTTP 200, but this is a **false positive**: Stoplight serves the same SPA shell for *any* subdomain, including nonsense ones. Always control-test a subdomain hit before believing it.
- GitHub code search for `app.careerplug.com/api` — no results
- CareerPlug's own [Setting up and managing APIs](https://partnersupport.careerplug.com/setting-up-and-managing-apis) documents only the credential-creation screen and stops. No base URL, no endpoints, no spec link.
- Connector vendors (Kombo, Unified.to) expose their own abstraction, never CareerPlug's paths.

## Architecture

Three hosts, three different stacks:

| Host | Stack | Serves | 404 body |
|---|---|---|---|
| `app.careerplug.com` | Rails + Doorkeeper | OAuth only | `{"error":"not_found"}` |
| `api.careerplug.com` | Ruby Grape + WineBouncer | v1 API + docs | `{"error":"Unable to find endpoint"}` |
| `feed.careerplug.com` | S3 + CloudFront | Static XML feeds | `403` (listing disabled) |

Those two distinct 404 bodies are the fastest way to tell which host a request actually reached.

`app.careerplug.com/api/accounts` also exists but answers `HTTP Basic: Access denied.` and ignores OAuth bearer tokens entirely — a legacy endpoint, not part of the v1 API.

## Refreshing

```bash
pnpm refresh   # fetch-spec + generate + gen-docs
git diff specs/
```

`fetch-spec` warns if a per-resource view exposes a path the root document omits — a new resource would otherwise be silently skipped by code generation.

## Escalation

The endpoint reference beyond the spec (and provisioning questions) sits with CareerPlug's Technical Account Manager: **TechAM@careerplug.com**.
