/**
 * CareerPlug authentication -- hand-written, not generated.
 *
 * Two things about CareerPlug's OAuth are easy to get wrong, and both are
 * encoded here so callers never have to think about them:
 *
 *   1. Tokens are minted on a DIFFERENT HOST than the API.
 *        mint  ->  https://app.careerplug.com/oauth/token   (Rails + Doorkeeper)
 *        call  ->  https://api.careerplug.com/...           (Grape + WineBouncer)
 *
 *   2. The token travels as a QUERY parameter named `access_token`, not as an
 *      `Authorization: Bearer` header. This is what the spec's
 *      `securityDefinitions` declares, so it is what this client sends.
 *
 * Two grant types are supported, per CareerPlug's documentation:
 *
 *   client_credentials  -- machine-to-machine. Issues a 48h access token and NO
 *                          refresh token; you simply re-mint on expiry. The
 *                          resulting token has no resource owner
 *                          (`resource_owner_id: null`).
 *   authorization_code  -- user-centric. Issues an access token AND a refresh
 *                          token. The authorization code must be exchanged
 *                          within 10 MINUTES of being issued.
 *
 * Usage:
 *
 *   import { CareerPlugAuth, configureCareerPlug } from "@flamel-ai/careerplug-api";
 *
 *   const auth = CareerPlugAuth.clientCredentials({
 *     clientId: process.env.CAREERPLUG_CLIENT_ID!,
 *     clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
 *   });
 *   configureCareerPlug({ auth });
 *
 *   import { getJobs } from "@flamel-ai/careerplug-api";
 *   const { data } = await getJobs({ query: { per_page: 50 } });
 */
import { z } from "zod";

import { CareerPlugAuthError } from "./errors.js";

/** Rails + Doorkeeper host. Serves OAuth only -- never API resources. */
export const OAUTH_BASE_URL = "https://app.careerplug.com";

/** Grape host. Serves API resources only -- never OAuth. */
export const API_BASE_URL = "https://api.careerplug.com";

export const TOKEN_URL = `${OAUTH_BASE_URL}/oauth/token`;
export const AUTHORIZE_URL = `${OAUTH_BASE_URL}/oauth/authorize`;
/** Doorkeeper token introspection -- useful for debugging scope problems. */
export const TOKEN_INFO_URL = `${OAUTH_BASE_URL}/oauth/token/info`;

/**
 * The only scope a `global_partner_api` application is permitted to request.
 * Every other value tested (`public`, `partner_api`, `account_api`, `read`,
 * `api`, and the empty string) is rejected with `invalid_scope`.
 */
export const GLOBAL_PARTNER_API_SCOPE = "global_partner_api";

/**
 * Out-of-band redirect URI. CareerPlug's own application form instructs you to
 * use this for client_credentials applications, where it is never dereferenced.
 * Doorkeeper also accepts it for authorization_code, in which case it renders
 * the code on screen for manual copying -- fine for a one-time internal hookup,
 * unsuitable for automated per-customer onboarding (use a real https callback).
 */
export const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

/** Successful Doorkeeper token response. */
export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  /** Seconds until expiry. CareerPlug issues 172800 (48 hours). */
  expires_in: z.number(),
  /** Present for authorization_code; absent for client_credentials. */
  refresh_token: z.string().optional(),
  /** Space-delimited string, or an array on some Doorkeeper versions. */
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  created_at: z.number().optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/** Doorkeeper OAuth error body (`invalid_client`, `invalid_scope`, …). */
export const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** Response from `GET /oauth/token/info`. */
export const tokenInfoSchema = z.object({
  resource_owner_id: z.union([z.number(), z.string(), z.null()]).optional(),
  resource_owner_type: z.union([z.string(), z.null()]).optional(),
  scope: z.array(z.string()).optional(),
  expires_in: z.number().optional(),
  application: z.object({ uid: z.string() }).optional(),
  created_at: z.number().optional(),
});

export type TokenInfo = z.infer<typeof tokenInfoSchema>;

export interface ClientCredentialsOptions {
  clientId: string;
  clientSecret: string;
  /** Defaults to {@link GLOBAL_PARTNER_API_SCOPE}. */
  scope?: string;
  /** Override the OAuth host (testing / mock servers). */
  oauthBaseUrl?: string;
  /**
   * Refresh this many seconds before actual expiry, so a token never expires
   * mid-flight on a slow request. Defaults to 60.
   */
  expirySkewSeconds?: number;
  fetch?: typeof globalThis.fetch;
}

export interface AuthorizationCodeOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** A previously obtained refresh token, to seed the auth without re-consent. */
  refreshToken?: string;
  /** A previously obtained access token, if you already have a live one. */
  accessToken?: string;
  /** Unix seconds at which `accessToken` expires, if known. */
  accessTokenExpiresAt?: number;
  oauthBaseUrl?: string;
  expirySkewSeconds?: number;
  fetch?: typeof globalThis.fetch;
  /**
   * Called whenever a new token pair is obtained, so you can persist it. The
   * refresh token is long-lived; losing it means re-running user consent.
   */
  onTokens?: (tokens: TokenResponse) => void | Promise<void>;
}

/** A static, already-minted token. No refresh capability. */
export interface StaticTokenOptions {
  accessToken: string;
  expiresAt?: number;
}

type Grant =
  | { kind: "client_credentials"; options: ClientCredentialsOptions }
  | { kind: "authorization_code"; options: AuthorizationCodeOptions }
  | { kind: "static"; options: StaticTokenOptions };

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Builds the authorization-code consent URL a CareerPlug administrator must
 * visit while logged in. The resulting code expires in 10 minutes.
 */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  oauthBaseUrl?: string;
}): string {
  const url = new URL(`${params.oauthBaseUrl ?? OAUTH_BASE_URL}/oauth/authorize`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  if (params.scope) url.searchParams.set("scope", params.scope);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/** POSTs to the Doorkeeper token endpoint and validates the response. */
async function requestToken(
  body: Record<string, string>,
  opts: { oauthBaseUrl?: string; fetch?: typeof globalThis.fetch },
): Promise<TokenResponse> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const url = `${opts.oauthBaseUrl ?? OAUTH_BASE_URL}/oauth/token`;

  const res = await doFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CareerPlugAuthError(
      `Token endpoint returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
      { status: res.status },
    );
  }

  if (!res.ok) {
    const err = oauthErrorSchema.safeParse(json);
    if (err.success) {
      // `invalid_client` is the single most common failure and is ambiguous by
      // design: Doorkeeper returns it for a wrong id, a wrong secret, AND a
      // revoked application. Say so, because the raw message does not.
      const hint =
        err.data.error === "invalid_client"
          ? " (invalid_client means a wrong client_id, a wrong client_secret, OR a revoked " +
            "application -- Doorkeeper does not distinguish. Confirm the credentials were " +
            "copy-pasted, not retyped: CareerPlug's credential font makes I/l/1 and 0/O " +
            "indistinguishable.)"
          : err.data.error === "invalid_scope"
            ? ` (invalid_scope: this application may only request "${GLOBAL_PARTNER_API_SCOPE}".)`
            : "";
      throw new CareerPlugAuthError(
        `${err.data.error}: ${err.data.error_description ?? "no description"}${hint}`,
        { status: res.status, oauthError: err.data.error },
      );
    }
    throw new CareerPlugAuthError(`Token request failed (HTTP ${res.status}): ${text.slice(0, 200)}`, {
      status: res.status,
    });
  }

  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new CareerPlugAuthError(
      `Token response did not match the expected shape: ${parsed.error.message}`,
      { status: res.status },
    );
  }
  return parsed.data;
}

/**
 * Holds CareerPlug credentials and vends a valid access token, minting and
 * refreshing as needed. Concurrent callers share one in-flight refresh.
 */
export class CareerPlugAuth {
  private grant: Grant;
  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt = 0;
  private inFlight?: Promise<string>;

  private constructor(grant: Grant) {
    this.grant = grant;
    if (grant.kind === "static") {
      this.accessToken = grant.options.accessToken;
      this.expiresAt = grant.options.expiresAt ?? Number.MAX_SAFE_INTEGER;
    }
    if (grant.kind === "authorization_code") {
      this.accessToken = grant.options.accessToken;
      this.refreshToken = grant.options.refreshToken;
      this.expiresAt = grant.options.accessTokenExpiresAt ?? 0;
    }
  }

  /** Machine-to-machine. 48h tokens, no refresh token, re-mints automatically. */
  static clientCredentials(options: ClientCredentialsOptions): CareerPlugAuth {
    return new CareerPlugAuth({ kind: "client_credentials", options });
  }

  /** User-centric. Seed with a refresh token (or access token) from consent. */
  static authorizationCode(options: AuthorizationCodeOptions): CareerPlugAuth {
    return new CareerPlugAuth({ kind: "authorization_code", options });
  }

  /** Wrap a token you already have. No refresh capability. */
  static staticToken(options: StaticTokenOptions | string): CareerPlugAuth {
    const opts = typeof options === "string" ? { accessToken: options } : options;
    return new CareerPlugAuth({ kind: "static", options: opts });
  }

  /**
   * Exchanges an authorization code for tokens. The code expires 10 minutes
   * after the administrator authorizes the application.
   */
  static async exchangeCode(
    params: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      code: string;
      oauthBaseUrl?: string;
      fetch?: typeof globalThis.fetch;
    },
  ): Promise<TokenResponse> {
    return requestToken(
      {
        grant_type: "authorization_code",
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        code: params.code,
      },
      params,
    );
  }

  /**
   * Whether a 401 can be recovered by minting again.
   *
   * A static token has no credentials behind it, and an authorization_code
   * grant needs a refresh token. For those, discarding the cached token
   * destroys the only credential the caller has, and the next mint fails with
   * a message about construction rather than the 401 the server sent. Callers
   * that retry on 401 must check this first.
   */
  get canReMint(): boolean {
    if (this.grant.kind === "static") return false;
    if (this.grant.kind === "authorization_code") return Boolean(this.refreshToken);
    return true;
  }

  private get skew(): number {
    if (this.grant.kind === "static") return 0;
    return this.grant.options.expirySkewSeconds ?? 60;
  }

  private async mint(): Promise<string> {
    const grant = this.grant;

    if (grant.kind === "static") {
      if (!this.accessToken) {
        throw new CareerPlugAuthError("Static token auth was constructed without an access token");
      }
      return this.accessToken;
    }

    if (grant.kind === "client_credentials") {
      const tokens = await requestToken(
        {
          grant_type: "client_credentials",
          client_id: grant.options.clientId,
          client_secret: grant.options.clientSecret,
          scope: grant.options.scope ?? GLOBAL_PARTNER_API_SCOPE,
        },
        grant.options,
      );
      this.applyTokens(tokens);
      return tokens.access_token;
    }

    if (!this.refreshToken) {
      throw new CareerPlugAuthError(
        "authorization_code auth has no refresh token and no valid access token. Run the " +
          "consent flow (buildAuthorizeUrl -> exchangeCode) and seed the result.",
      );
    }
    const tokens = await requestToken(
      {
        grant_type: "refresh_token",
        client_id: grant.options.clientId,
        client_secret: grant.options.clientSecret,
        redirect_uri: grant.options.redirectUri,
        refresh_token: this.refreshToken,
      },
      grant.options,
    );
    this.applyTokens(tokens);
    if (grant.options.onTokens) await grant.options.onTokens(tokens);
    return tokens.access_token;
  }

  private applyTokens(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token;
    // Doorkeeper only returns a refresh token for authorization_code. Keep any
    // existing one rather than clobbering it with undefined.
    if (tokens.refresh_token) this.refreshToken = tokens.refresh_token;
    this.expiresAt = nowSeconds() + tokens.expires_in;
  }

  /** Returns a valid access token, minting or refreshing if necessary. */
  async getAccessToken(): Promise<string> {
    if (this.accessToken && nowSeconds() < this.expiresAt - this.skew) {
      return this.accessToken;
    }
    // Collapse concurrent refreshes so a burst of parallel requests mints once.
    this.inFlight ??= this.mint().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Discards the cached token, forcing a fresh mint on the next call. */
  invalidate(): void {
    this.accessToken = undefined;
    this.expiresAt = 0;
  }

  /** Introspects the current token via Doorkeeper's `/oauth/token/info`. */
  async introspect(): Promise<TokenInfo> {
    const token = await this.getAccessToken();
    const grant = this.grant;
    const base =
      grant.kind === "static" ? OAUTH_BASE_URL : (grant.options.oauthBaseUrl ?? OAUTH_BASE_URL);
    const doFetch = grant.kind === "static" ? globalThis.fetch : (grant.options.fetch ?? globalThis.fetch);

    const res = await doFetch(`${base}/oauth/token/info`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new CareerPlugAuthError(`Token introspection failed (HTTP ${res.status})`, {
        status: res.status,
      });
    }
    return tokenInfoSchema.parse(json);
  }
}
