# Authentication

CareerPlug uses OAuth 2.0. Two details trip up nearly every integration:

1. **Tokens are minted on a different host than the API.** Mint on `app.careerplug.com`; call `api.careerplug.com`.
2. **The token travels as a query parameter**, `?access_token=…`, not as an `Authorization: Bearer` header. This is what the spec's `securityDefinitions` declares, and it is what the Grape/WineBouncer layer reads.

## Creating an application

An administrator creates it in the CareerPlug UI under **Toolkit → Integrations → API → Create API Application**. The form asks for a name and a redirect URI, and on save shows a **Client ID** (labeled *Application*) and a **Client Secret** (labeled *Secret*), plus the granted **Scopes**.

> **Copy-paste these. Never retype or OCR them.** CareerPlug's credential font makes `I` / `l` / `1` and `0` / `O` indistinguishable. A single wrong character produces `invalid_client`, which is the *same* error Doorkeeper returns for a revoked application — so a typo looks exactly like a provisioning problem and can cost hours.

## Which redirect URI?

The form's own hint: *"Required for authorization_code flow. Use `urn:ietf:wg:oauth:2.0:oob` for client_credentials only."*

| Your flow | Redirect URI |
|---|---|
| `client_credentials` | `urn:ietf:wg:oauth:2.0:oob` — correct, and never dereferenced |
| `authorization_code`, one-time internal hookup | `oob` works: Doorkeeper renders the code on screen to copy manually |
| `authorization_code`, automated per-customer onboarding | A real `https://` callback you control |

For a machine-to-machine integration there is no browser consent step, so no callback URL is ever fetched and `oob` is inert. Only change it if you move to the user-centric flow.

## Grant type 1: `client_credentials`

The straightforward machine-to-machine option.

```ts
import { CareerPlugAuth, configureCareerPlug } from "@flamel-ai/careerplug-api";

configureCareerPlug({
  auth: CareerPlugAuth.clientCredentials({
    clientId: process.env.CAREERPLUG_CLIENT_ID!,
    clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
  }),
});
```

Raw equivalent:

```bash
curl -X POST https://app.careerplug.com/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d 'grant_type=client_credentials&scope=global_partner_api'
```

```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 172800,
  "scope": "global_partner_api", "created_at": 1785257549 }
```

- **48-hour** lifetime (`expires_in: 172800`).
- **No refresh token.** Re-mint with the same request when it expires; this SDK does that automatically.
- Credentials may be sent as HTTP Basic, as form-encoded body params, or as query-string params — all three work. **Prefer the body.** Query strings land in access logs, proxy logs, and browser history; request bodies do not. This SDK always uses the body.

### Scopes

`global_partner_api` is the only scope such an application may request. Every other value tested — `public`, `partner_api`, `account_api`, `read`, `jobs`, `api`, and the empty string — returns `invalid_scope`.

### ⚠️ Known limitation

A valid `client_credentials` token is **rejected by every v1 resource endpoint**:

```json
{"error":"OAuth error: WineBouncer::Errors::OAuthUnauthorizedError"}
```

This holds via the query parameter and via a bearer header. Introspection confirms the token itself is fine:

```bash
curl -H "Authorization: Bearer $TOKEN" https://app.careerplug.com/oauth/token/info
# {"resource_owner_id":null,"scope":["global_partner_api"],"expires_in":172800,…}
```

Note `resource_owner_id: null`. The working hypothesis — **not yet confirmed** — is that the v1 endpoints require a resource-owner (user) token, which only `authorization_code` produces. It may instead be a per-application provisioning setting. Either way: **TechAM@careerplug.com**.

## Grant type 2: `authorization_code`

The user-centric flow. Yields a user-scoped access token **and** a refresh token.

### Step 1 — consent

An administrator, logged into CareerPlug, visits:

```ts
import { buildAuthorizeUrl, OOB_REDIRECT_URI } from "@flamel-ai/careerplug-api";

const url = buildAuthorizeUrl({
  clientId: process.env.CAREERPLUG_CLIENT_ID!,
  redirectUri: OOB_REDIRECT_URI,
  state: "csrf-token-you-generated",
});
```

Depending on how the application was configured, the code is either sent to your callback or converted to a token automatically.

### Step 2 — exchange, within 10 minutes

The authorization code **expires 10 minutes** after it is issued.

```ts
const tokens = await CareerPlugAuth.exchangeCode({
  clientId: process.env.CAREERPLUG_CLIENT_ID!,
  clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
  redirectUri: OOB_REDIRECT_URI,
  code: codeFromCallback,
});
// Persist tokens.refresh_token -- losing it means re-running consent.
```

### Step 3 — use, and refresh automatically

```ts
configureCareerPlug({
  auth: CareerPlugAuth.authorizationCode({
    clientId: process.env.CAREERPLUG_CLIENT_ID!,
    clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
    redirectUri: OOB_REDIRECT_URI,
    refreshToken: await loadStoredRefreshToken(),
    onTokens: async (t) => persistTokens(t), // called on every refresh
  }),
});
```

## Error reference

| Body | Meaning |
|---|---|
| `{"error":"invalid_client"}` | Wrong client id, wrong secret, **or** a revoked application — Doorkeeper does not distinguish |
| `{"error":"invalid_scope"}` | The application may not request that scope; use `global_partner_api` |
| `{"error":"invalid_grant"}` | Expired/already-used authorization code, or an invalid refresh token |
| `{"error":"OAuth error: WineBouncer::…OAuthUnauthorizedError"}` | Token rejected by the API — see the known limitation above |
| `{"error":"Unable to find endpoint"}` | Wrong path on `api.careerplug.com` |
| `{"error":"not_found"}` | Wrong path on `app.careerplug.com` (which serves OAuth only) |
| `HTTP Basic: Access denied.` | A legacy non-OAuth endpoint that ignores bearer tokens entirely |

`explainCareerPlugError(body)` turns any of these into an actionable sentence.

## Endpoints

| Purpose | URL |
|---|---|
| Mint / refresh | `POST https://app.careerplug.com/oauth/token` |
| Consent | `GET https://app.careerplug.com/oauth/authorize` |
| Introspect | `GET https://app.careerplug.com/oauth/token/info` |
| API base | `https://api.careerplug.com` |
