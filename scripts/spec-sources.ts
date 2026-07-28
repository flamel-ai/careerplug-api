/**
 * Single source of truth for where the CareerPlug spec comes from.
 *
 * CareerPlug does not publish an OpenAPI file to a repo or a docs CDN. The only
 * machine-readable definition is served live by the API itself, at the
 * grape-swagger conventional path `/swagger_doc` (NOT `/openapi.json`,
 * `/swagger.json`, or `/docs.json` -- all of those 404). `fetch-spec.ts` pulls
 * it and vendors it into `specs/` so generation is reproducible and offline.
 *
 * The API is a Ruby Grape + WineBouncer app. Its "endpoint not found" body is
 * `{"error":"Unable to find endpoint"}`; the separate Rails app on
 * `app.careerplug.com` (which serves OAuth) says `{"error":"not_found"}`. That
 * difference is the quickest way to tell which host you actually reached.
 */

/** Grape API host that serves both the endpoints and the spec. */
export const API_HOST = "https://api.careerplug.com";

/** Rails + Doorkeeper host that serves OAuth. NOT the same host as the API. */
export const OAUTH_HOST = "https://app.careerplug.com";

/** Complete Swagger 2.0 document: every path and definition in one file. */
export const ROOT_SPEC_URL = `${API_HOST}/swagger_doc`;

/** Human-readable Swagger UI (also carries the authentication narrative). */
export const DOCS_URL = `${API_HOST}/docs`;

/**
 * grape-swagger also serves a per-resource view of the spec at
 * `/swagger_doc/<resource>` -- these are the "tabs" in the Swagger UI. Each is a
 * strict subset of the root document (verified: the union of their paths equals
 * the root's exactly, with no path unique to either side).
 *
 * We vendor them anyway, under `specs/resources/`, purely for traceability: if
 * CareerPlug ever adds a resource that the root document omits, a refresh diff
 * makes it obvious. Code generation reads ONLY the root document.
 */
export const RESOURCES = [
  "apps",
  "brands",
  "departments",
  "employments",
  "jobs",
  "locations",
  "users",
] as const;

export type Resource = (typeof RESOURCES)[number];

export const resourceSpecUrl = (resource: Resource | string): string =>
  `${ROOT_SPEC_URL}/${resource}`;
