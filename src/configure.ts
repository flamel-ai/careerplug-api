/**
 * Wires {@link CareerPlugAuth} into the generated fetch client.
 *
 * The generated SDK has no notion of CareerPlug's auth convention, so we
 * install a fetch wrapper that, on every request:
 *
 *   1. mints/refreshes a token as needed, and
 *   2. appends it as the `access_token` QUERY parameter.
 *
 * A retry-once-on-401 is included because a 48h token can expire between the
 * expiry check and the server reading it, and because a token can be revoked
 * server-side at any time. The retry invalidates the cache and re-mints once --
 * it does not loop.
 */
import { client as generatedClient } from "./generated/client.gen.js";
import { CareerPlugAuth, API_BASE_URL } from "./auth.js";
import { explainCareerPlugError } from "./errors.js";

/** Structural shape of a generated hey-api client. */
export interface ConfigurableClient {
  setConfig: (config: { baseUrl?: string; fetch?: typeof globalThis.fetch }) => unknown;
}

export interface ConfigureOptions {
  /** Credentials. Build with `CareerPlugAuth.clientCredentials(...)` etc. */
  auth: CareerPlugAuth;
  /** Override the API host (mock servers, proxies). */
  baseUrl?: string;
  /** Underlying fetch. Defaults to the global. */
  fetch?: typeof globalThis.fetch;
  /**
   * Retry once with a freshly minted token when the API answers 401.
   * Defaults to true.
   */
  retryOnUnauthorized?: boolean;
}

/** Builds the auth-injecting fetch wrapper. Exported for testing. */
export function createAuthenticatedFetch(options: ConfigureOptions): typeof globalThis.fetch {
  const baseFetch = options.fetch ?? globalThis.fetch;
  const retry = options.retryOnUnauthorized ?? true;

  const withToken = async (request: Request, token: string): Promise<Request> => {
    const url = new URL(request.url);
    url.searchParams.set("access_token", token);
    return new Request(url, request);
  };

  return async (input, init) => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);

    const token = await options.auth.getAccessToken();
    // A Request body can only be read once, so clone before the first send in
    // case we need to replay it for the retry.
    const replay = retry ? request.clone() : undefined;

    let response = await baseFetch(await withToken(request, token));

    // Only retry when the grant can actually mint again. Invalidating a
    // static token (or an authorization_code grant with no refresh token)
    // throws away the only credential and replaces the server's 401 with a
    // confusing auth-construction error.
    if (retry && response.status === 401 && replay && options.auth.canReMint) {
      options.auth.invalidate();
      const fresh = await options.auth.getAccessToken();
      response = await baseFetch(await withToken(replay, fresh));
    }

    return response;
  };
}

/**
 * Configures the default generated client. Call once at startup.
 *
 *   configureCareerPlug({
 *     auth: CareerPlugAuth.clientCredentials({ clientId, clientSecret }),
 *   });
 */
export function configureCareerPlug(options: ConfigureOptions): void {
  configureCareerPlugClient(generatedClient as unknown as ConfigurableClient, options);
}

/** Configures a specific client instance rather than the default one. */
export function configureCareerPlugClient(
  client: ConfigurableClient,
  options: ConfigureOptions,
): void {
  client.setConfig({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    fetch: createAuthenticatedFetch(options),
  });
}

/**
 * Given a failed response body, returns a human-actionable explanation, or
 * undefined if the body is not a recognized CareerPlug error shape.
 * Re-exported here so callers importing `configure` get the diagnostic too.
 */
export { explainCareerPlugError };
