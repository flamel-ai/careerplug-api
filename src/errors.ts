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
 * Raised when the API accepts the request but rejects the token's authority.
 *
 * The overwhelmingly common cause is a `client_credentials` token: it carries no
 * resource owner (`resource_owner_id: null`), and the v1 resource endpoints
 * appear to require a user-scoped token from the `authorization_code` flow.
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
      "The API rejected this token's authority. A client_credentials token has no resource " +
      "owner and does not appear to satisfy the v1 resource endpoints; try the " +
      "authorization_code flow, and confirm the application is provisioned for the endpoints " +
      "you are calling."
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
