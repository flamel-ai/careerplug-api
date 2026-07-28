/**
 * Error types for the CareerPlug SDK.
 *
 * CareerPlug returns several structurally different error bodies depending on
 * which layer rejected you, and telling them apart is most of the debugging:
 *
 *   {"error":"Unable to find endpoint"}                        no route on api.careerplug.com
 *   {"error":"not_found"}                                      no route on app.careerplug.com
 *   {"error":"OAuth error: WineBouncer::Errors::OAuthUnauthorizedError"}
 *                                                              token rejected by the API
 *   {"error":"invalid_client", "error_description":"…"}        Doorkeeper credential failure
 *   HTTP Basic: Access denied.                                 a legacy non-OAuth endpoint
 *   bare HTML 403, no x-request-id / x-runtime                 AWS load-balancer throttle;
 *                                                              Ruby never saw the request
 */

/** Base class for every error this SDK raises. */
export class CareerPlugError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CareerPlugError";
    this.status = options?.status;
  }
}

/** Raised when minting, refreshing, or introspecting a token fails. */
export class CareerPlugAuthError extends CareerPlugError {
  /** The Doorkeeper `error` code, when the body carried one. */
  readonly oauthError?: string;

  constructor(message: string, options?: { status?: number; oauthError?: string; cause?: unknown }) {
    super(message, options);
    this.name = "CareerPlugAuthError";
    this.oauthError = options?.oauthError;
  }
}

/**
 * Raised when the API accepts the token but rejects its authority for a resource.
 *
 * Usual causes, in order of likelihood:
 *   1. The application is not provisioned for that resource. Granted scopes and
 *      account access are configured per application on CareerPlug's side, so
 *      this is not fixable from the client.
 *   2. The resource needs a user-scoped token. Introspect via
 *      `/oauth/token/info`: `resource_owner_id: null` means a
 *      `client_credentials` token with no user attached.
 */
export class CareerPlugUnauthorizedError extends CareerPlugError {
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options);
    this.name = "CareerPlugUnauthorizedError";
  }
}

/** True if a body looks like WineBouncer's OAuth rejection. */
export function isWineBouncerUnauthorized(body: unknown): boolean {
  if (typeof body === "string") return body.includes("WineBouncer");
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: unknown }).error;
    return typeof err === "string" && err.includes("WineBouncer");
  }
  return false;
}

/**
 * Explains an opaque CareerPlug error body in terms a caller can act on.
 * Returns undefined when the body is not one of the recognized shapes.
 */
export function explainCareerPlugError(body: unknown, status?: number): string | undefined {
  const raw =
    typeof body === "string"
      ? body
      : typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : undefined;
  if (raw === undefined) return undefined;

  if (raw.includes("WineBouncer")) {
    return (
      "The token is valid but was not accepted for this resource. Most often the application " +
      "is not provisioned for it (granted scopes and account access are set per application " +
      "by CareerPlug). Introspect at app.careerplug.com/oauth/token/info: if " +
      "`resource_owner_id` is null you hold a client_credentials token, and a user- or " +
      "account-scoped resource may require the authorization_code flow. If provisioning looks " +
      "correct, escalate to TechAM@careerplug.com."
    );
  }
  if (raw === "Unable to find endpoint") {
    return (
      "No such route on api.careerplug.com. Check the path against specs/openapi.json -- note " +
      "the API has no version prefix (`/jobs`, not `/v1/jobs`)."
    );
  }
  if (raw === "not_found") {
    return (
      "No such route on app.careerplug.com. That host serves OAuth only; API resources live on " +
      "api.careerplug.com."
    );
  }
  if (raw.includes("HTTP Basic")) {
    return (
      "This endpoint uses legacy HTTP Basic auth and ignores OAuth bearer tokens entirely. It " +
      "is not part of the v1 OAuth API."
    );
  }
  if (raw === "invalid_client") {
    return (
      "Wrong client_id, wrong client_secret, or a revoked application -- Doorkeeper returns the " +
      "same code for all three."
    );
  }
  if (raw === "invalid_scope") {
    return `The application is not permitted to request that scope (status ${status ?? "?"}).`;
  }
  return undefined;
}

/**
 * True when a response came from the AWS load balancer rather than the Ruby
 * application -- i.e. an infrastructure rate limit, not an auth decision.
 *
 * This matters because the throttle surfaces as a bare HTML `403`, which reads
 * like a permissions failure and sends you debugging credentials that are
 * completely fine. The reliable discriminator is that every real application
 * response carries Rails' `x-request-id` and `x-runtime` headers, and a
 * load-balancer response carries neither.
 *
 *   if (isInfrastructureThrottle(res)) {
 *     // back off; do NOT retry immediately -- retries keep the rate elevated
 *     // and extend the block. It clears on its own once traffic subsides.
 *   }
 */
export function isInfrastructureThrottle(response: {
  status: number;
  headers: { get(name: string): string | null };
}): boolean {
  if (response.status !== 403 && response.status !== 429) return false;
  const hasAppHeaders =
    response.headers.get("x-request-id") !== null || response.headers.get("x-runtime") !== null;
  return !hasAppHeaders;
}

/** Raised when a request is throttled at the edge before reaching the app. */
export class CareerPlugThrottledError extends CareerPlugError {
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options);
    this.name = "CareerPlugThrottledError";
  }
}
