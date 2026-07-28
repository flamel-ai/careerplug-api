# Authentication

CareerPlug requires OAuth 2.0 on every API request, and offers **two grant types**:

| Grant | Use it when | Gives you |
|---|---|---|
| **`client_credentials`** | Building a custom/server-side integration | 48h access token, **no** refresh token |
| **`authorization_code`** | A typical user-centric OAuth flow | 48h access token **+** a refresh token |

Two mechanics matter regardless of which you pick:

1. **Tokens are minted on a different host than the API.** Mint on `app.careerplug.com`; call `api.careerplug.com`.
2. **The token travels as a query parameter** — `?access_token=…` — not as an `Authorization: Bearer` header. That is what the spec's `securityDefinitions` declares and what the API reads.

---

## Creating an OAuth application

An administrator creates it from the Settings page (**Toolkit → Integrations → API → Create API Application**). It requires a **name** and a **callback URL**. For initial testing you can proceed without a live endpoint to receive responses.

On save you get an **application key** (your `client_id`, labeled *Application*) and a **secret key** (your `client_secret`, labeled *Secret*). Both are used in all OAuth requests.

The administrator may also authorize the application at this point. That produces an access code (grant token) which is either sent to your callback or automatically converted to an access token, depending on how the application was configured.

> **Copy-paste the credentials. Never retype or OCR them.** CareerPlug's credential font makes `I` / `l` / `1` and `0` / `O` indistinguishable. One wrong character produces `invalid_client` — the *same* error a revoked application returns, so a typo is indistinguishable from a provisioning problem.

### Which callback URL?

| Your flow | Callback URL |
|---|---|
| `client_credentials` | `urn:ietf:wg:oauth:2.0:oob` — the form's own hint says to use this; it is never dereferenced |
| `authorization_code`, one-time internal setup | `oob` works — Doorkeeper renders the code on screen to copy manually |
| `authorization_code`, automated per-customer onboarding | A real `https://` callback you control |

There is no browser consent step in `client_credentials`, so no callback is ever fetched. Only change it if you move to the user-centric flow.

---

## Grant type 1: `client_credentials`

The most straightforward option, and a good choice for a custom integration. Post your `client_id` and `client_secret` to `/oauth/token`; you get back an access token good for 48 hours. There is no refresh token — when it expires, make the same request again.

```ts
import { CareerPlugAuth, configureCareerPlug } from "@flamel-ai/careerplug-api";

configureCareerPlug({
  auth: CareerPlugAuth.clientCredentials({
    clientId: process.env.CAREERPLUG_CLIENT_ID!,
    clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
  }),
});
```

That's all you need: the SDK mints on first use, caches the token for its full 48-hour life, collapses concurrent mints into a single request, re-mints automatically on expiry, and appends `access_token` to every call.

### The raw request

```bash
curl -X POST https://app.careerplug.com/oauth/token \
  -d 'grant_type=client_credentials' \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d 'scope=global_partner_api'
```

```json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 172800,
  "scope": "global_partner_api",
  "created_at": 1785259547
}
```

Use that `access_token` on every API call until `expires_in` elapses (48 hours), then mint another the same way.

Credentials may be sent as HTTP Basic, as form-encoded body params, or as query-string params — all three work. **Prefer the body.** Query strings land in access logs, proxy logs, and browser history; bodies do not. This SDK always uses the body.

### Scope

Pass `scope=global_partner_api`. For a global-partner application this is the only permitted value — `public`, `partner_api`, `account_api`, `read`, `jobs`, `api`, and the empty string all return `invalid_scope`. Your application's granted scopes are shown on its credentials page.

---

## Grant type 2: `authorization_code`

The typical user-centric OAuth 2.0 flow. Use it when the integration should act as a specific CareerPlug user, or when you need a refresh token so an administrator never has to re-authorize.

### Step 1 — authorize, and receive an access code

The user who created the application, **logged into CareerPlug**, visits:

```
https://app.careerplug.com/oauth/authorize?client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&response_type=code
```

```ts
import { buildAuthorizeUrl } from "@flamel-ai/careerplug-api";

const url = buildAuthorizeUrl({
  clientId: process.env.CAREERPLUG_CLIENT_ID!,
  redirectUri: process.env.CAREERPLUG_REDIRECT_URI!,
  state: "csrf-token-you-generated",
});
```

### Step 2 — convert the code to an access token, within 10 minutes

**The access code expires after ten minutes.** POST to `https://app.careerplug.com/oauth/token` with `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`, and `code`.

```ts
const tokens = await CareerPlugAuth.exchangeCode({
  clientId: process.env.CAREERPLUG_CLIENT_ID!,
  clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
  redirectUri: process.env.CAREERPLUG_REDIRECT_URI!,
  code: codeFromCallback,
});
```

The result contains **both an access token and a refresh token**. The access token works for two days; the refresh token mints new ones. **Store both.**

### Step 3 — use it, and let the SDK refresh

After the access token expires, redeem the refresh token so the administrator does not have to re-authorize. Same endpoint, with `grant_type=refresh_token` plus `client_id`, `client_secret`, `redirect_uri`, and `refresh_token`.

```ts
configureCareerPlug({
  auth: CareerPlugAuth.authorizationCode({
    clientId: process.env.CAREERPLUG_CLIENT_ID!,
    clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
    redirectUri: process.env.CAREERPLUG_REDIRECT_URI!,
    refreshToken: await loadStoredRefreshToken(),
    onTokens: async (t) => persistTokens(t), // fires on every refresh
  }),
});
```

`onTokens` is where you persist the rotated pair. Losing the refresh token means re-running consent.

---

## Endpoints

| Purpose | URL |
|---|---|
| Mint / exchange / refresh | `POST https://app.careerplug.com/oauth/token` |
| Authorize (consent) | `GET https://app.careerplug.com/oauth/authorize` |
| Introspect a token | `GET https://app.careerplug.com/oauth/token/info` |
| API base | `https://api.careerplug.com` |

Introspection is handy for debugging:

```bash
curl -H "Authorization: Bearer $TOKEN" https://app.careerplug.com/oauth/token/info
# {"resource_owner_id":null,"scope":["global_partner_api"],"expires_in":172800,…}
```

`resource_owner_id` is `null` for `client_credentials` tokens (no user is attached) and set to the authorizing user's id for `authorization_code` tokens. That field is the quickest way to confirm which kind of token you are holding.

---

## Troubleshooting

### Error reference

| Body | Meaning |
|---|---|
| `{"error":"invalid_client"}` | Wrong client id, wrong secret, **or** a revoked application — Doorkeeper does not distinguish |
| `{"error":"invalid_scope"}` | The application may not request that scope |
| `{"error":"invalid_grant"}` | Expired or already-used access code, or an invalid refresh token |
| `{"error":"OAuth error: WineBouncer::…OAuthUnauthorizedError"}` | The API accepted the token but rejected its authority — see below |
| `{"error":"Unable to find endpoint"}` | Wrong path on `api.careerplug.com` |
| `{"error":"not_found"}` | Wrong path on `app.careerplug.com`, which serves OAuth only |
| `HTTP Basic: Access denied.` | A legacy non-OAuth endpoint that ignores bearer tokens |
| Bare HTML `403`, no `x-request-id` | Not an auth error at all — infrastructure throttle. See below. |

`explainCareerPlugError(body)` turns any of these into an actionable sentence.

### `WineBouncer::Errors::OAuthUnauthorizedError`

Your token minted fine but the API declined to serve that resource with it. Check, in order:

1. **Is the application provisioned for the endpoints you're calling?** Granted scopes and account access are configured per application on CareerPlug's side. This is the most common cause and is not something you can fix from the client.
2. **Do you need a user-scoped token?** Introspect: if `resource_owner_id` is `null`, you hold a `client_credentials` token. If the resource is user- or account-scoped, the `authorization_code` flow may be required.
3. **Are you on the right host?** Tokens mint on `app.careerplug.com`; resources live on `api.careerplug.com`.

If provisioning looks right and it still fails, that is a question for **TechAM@careerplug.com** — the granted-access model is not documented publicly.

### Bare `403` with no Rails headers = rate limit, not auth

If you get an HTML `403` whose headers include `server: awselb/2.0` and **no** `x-request-id` / `x-runtime`, you have been throttled at the AWS load balancer. The Ruby application never saw the request, so this is not an authentication problem no matter what the status code suggests.

Real application responses always carry `x-request-id` and `x-runtime`. That is the reliable discriminator, and `isInfrastructureThrottle(response)` implements it.

Back off and stop retrying — retries keep the rate elevated and extend the block. It clears on its own once traffic subsides. CareerPlug documents no rate limits, so keep concurrency modest: serialize pagination rather than fanning out, and prefer the [job-feed surface](job-feeds.md) for bulk data, which runs on separate infrastructure.
