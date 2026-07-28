import { describe, expect, it, vi } from "vitest";

import {
  CareerPlugAuth,
  GLOBAL_PARTNER_API_SCOPE,
  OOB_REDIRECT_URI,
  buildAuthorizeUrl,
} from "../src/auth.js";
import { CareerPlugAuthError, isInfrastructureThrottle } from "../src/errors.js";
import { createAuthenticatedFetch } from "../src/configure.js";

const tokenResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      access_token: "tok-1",
      token_type: "Bearer",
      expires_in: 172800,
      created_at: 1785257549,
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("buildAuthorizeUrl", () => {
  it("builds a consent URL on the OAuth host, not the API host", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "abc", redirectUri: OOB_REDIRECT_URI, state: "xyz" }),
    );
    expect(url.origin).toBe("https://app.careerplug.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(OOB_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("xyz");
  });
});

describe("CareerPlugAuth.clientCredentials", () => {
  it("mints against app.careerplug.com with the only permitted scope", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://app.careerplug.com/oauth/token");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("client_credentials");
      expect(body.get("scope")).toBe(GLOBAL_PARTNER_API_SCOPE);
      return tokenResponse();
    });

    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    expect(await auth.getAccessToken()).toBe("tok-1");
  });

  it("caches the token instead of re-minting on every call", async () => {
    const fetchMock = vi.fn(async () => tokenResponse());
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("collapses concurrent mints into a single in-flight request", async () => {
    const fetchMock = vi.fn(async () => tokenResponse());
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-mints after invalidate()", async () => {
    const fetchMock = vi.fn(async () => tokenResponse());
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await auth.getAccessToken();
    auth.invalidate();
    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-mints once the token is within the expiry skew", async () => {
    const fetchMock = vi.fn(async () => tokenResponse({ expires_in: 30 }));
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "secret",
      expirySkewSeconds: 60, // skew exceeds lifetime, so it is always "expiring"
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains that invalid_client is ambiguous between bad id, bad secret, and revocation", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed" }),
          { status: 401 },
        ),
    );
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "bad",
      clientSecret: "bad",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(auth.getAccessToken()).rejects.toThrow(CareerPlugAuthError);
    await expect(auth.getAccessToken()).rejects.toThrow(/wrong client_id.*wrong client_secret.*revoked/s);
  });

  it("explains invalid_scope in terms of the single permitted scope", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid_scope" }), { status: 401 }),
    );
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "s",
      scope: "nope",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await expect(auth.getAccessToken()).rejects.toThrow(/global_partner_api/);
  });
});

describe("CareerPlugAuth.authorizationCode", () => {
  it("refreshes using the refresh token and persists the new pair", async () => {
    const onTokens = vi.fn();
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("refresh-1");
      return tokenResponse({ access_token: "tok-2", refresh_token: "refresh-2" });
    });

    const auth = CareerPlugAuth.authorizationCode({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: OOB_REDIRECT_URI,
      refreshToken: "refresh-1",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      onTokens,
    });

    expect(await auth.getAccessToken()).toBe("tok-2");
    expect(onTokens).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: "refresh-2" }));
  });

  it("fails with actionable guidance when there is nothing to refresh with", async () => {
    const auth = CareerPlugAuth.authorizationCode({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: OOB_REDIRECT_URI,
    });
    await expect(auth.getAccessToken()).rejects.toThrow(/buildAuthorizeUrl -> exchangeCode/);
  });
});

describe("createAuthenticatedFetch", () => {
  it("sends the token as the access_token QUERY param, not a bearer header", async () => {
    const inner = vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      expect(url.searchParams.get("access_token")).toBe("tok-1");
      expect(req.headers.get("authorization")).toBeNull();
      return new Response("{}", { status: 200 });
    });

    const authed = createAuthenticatedFetch({
      auth: CareerPlugAuth.staticToken("tok-1"),
      fetch: inner as unknown as typeof globalThis.fetch,
    });
    await authed("https://api.careerplug.com/jobs");
    expect(inner).toHaveBeenCalledOnce();
  });

  it("retries exactly once with a fresh token on 401", async () => {
    let mints = 0;
    const mintFetch = vi.fn(async () => {
      mints += 1;
      return tokenResponse({ access_token: `tok-${mints}` });
    });
    const auth = CareerPlugAuth.clientCredentials({
      clientId: "id",
      clientSecret: "s",
      fetch: mintFetch as unknown as typeof globalThis.fetch,
    });

    const seen: string[] = [];
    const inner = vi.fn(async (req: Request) => {
      seen.push(new URL(req.url).searchParams.get("access_token")!);
      return new Response(
        JSON.stringify({ error: "OAuth error: WineBouncer::Errors::OAuthUnauthorizedError" }),
        { status: 401 },
      );
    });

    const authed = createAuthenticatedFetch({
      auth,
      fetch: inner as unknown as typeof globalThis.fetch,
    });
    const res = await authed("https://api.careerplug.com/jobs");

    expect(res.status).toBe(401);
    expect(seen).toEqual(["tok-1", "tok-2"]); // retried once, then gave up
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("does not retry when retryOnUnauthorized is off", async () => {
    const inner = vi.fn(async () => new Response("{}", { status: 401 }));
    const authed = createAuthenticatedFetch({
      auth: CareerPlugAuth.staticToken("tok"),
      fetch: inner as unknown as typeof globalThis.fetch,
      retryOnUnauthorized: false,
    });
    await authed("https://api.careerplug.com/jobs");
    expect(inner).toHaveBeenCalledOnce();
  });
});

describe("isInfrastructureThrottle", () => {
  it("flags a bare 403 with no Rails headers as a throttle, not an auth failure", () => {
    const res = new Response("<html>403 Forbidden</html>", {
      status: 403,
      headers: { server: "awselb/2.0" },
    });
    expect(isInfrastructureThrottle(res)).toBe(true);
  });

  it("does NOT flag a 403 that reached the app (Rails headers present)", () => {
    const res = new Response("{}", {
      status: 403,
      headers: { "x-request-id": "abc-123", "x-runtime": "0.004" },
    });
    expect(isInfrastructureThrottle(res)).toBe(false);
  });

  it("ignores non-throttle statuses", () => {
    expect(isInfrastructureThrottle(new Response("{}", { status: 401 }))).toBe(false);
    expect(isInfrastructureThrottle(new Response("{}", { status: 200 }))).toBe(false);
  });
});
