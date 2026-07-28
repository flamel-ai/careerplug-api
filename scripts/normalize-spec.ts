/**
 * Turns CareerPlug's live Swagger 2.0 document into a correct OpenAPI 3.x spec.
 *
 * We fix the SPEC rather than patching generated output, so the emitted types,
 * zod schemas, and SDK all come out right and `specs/swagger_doc.json` stays a
 * byte-for-byte untouched copy of what CareerPlug serves.
 *
 * Every fix below corresponds to a real defect in the upstream document,
 * verified against the live API. They are not speculative cleanups.
 */
import swagger2openapi from "swagger2openapi";

import { API_HOST, OAUTH_HOST } from "./spec-sources.js";

type Json = unknown;
type Obj = Record<string, Json>;

const isObject = (v: Json): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Upstream entity names are Grape-internal: `V1_Entities_JobEntity`. Left alone,
 * every generated TypeScript type is called `V1EntitiesJobEntity`. We rewrite
 * both the `definitions` keys and every `$ref` that points at them, so the SDK
 * exposes `Job`, `Location`, `Applicant`, … instead.
 */
const ENTITY_PREFIX = "V1_Entities_";

function cleanEntityName(name: string): string {
  const base = name.startsWith(ENTITY_PREFIX) ? name.slice(ENTITY_PREFIX.length) : name;
  // `JobEntity` -> `Job`, but keep `SimpleEntity` (dropping the suffix would
  // leave the meaningless name `Simple`) and leave non-Entity names as-is.
  if (base.endsWith("Entity") && base !== "SimpleEntity" && base !== "Entity") {
    return base.slice(0, -"Entity".length);
  }
  return base;
}

/** Rewrites `#/definitions/V1_Entities_X` -> `#/definitions/CleanX`, in place. */
function renameEntities(spec: Obj): void {
  const definitions = spec.definitions;
  if (!isObject(definitions)) return;

  const renames = new Map<string, string>();
  for (const original of Object.keys(definitions)) {
    const cleaned = cleanEntityName(original);
    if (cleaned !== original) renames.set(original, cleaned);
  }
  if (renames.size === 0) return;

  // Guard against a rename colliding with an existing definition -- silently
  // merging two different schemas would be a correctness bug.
  for (const [from, to] of renames) {
    if (to in definitions && !renames.has(to)) {
      throw new Error(`Renaming definition ${from} -> ${to} would collide with an existing definition`);
    }
  }

  const renamed: Obj = {};
  for (const [key, value] of Object.entries(definitions)) {
    renamed[renames.get(key) ?? key] = value;
  }
  spec.definitions = renamed;

  const walkRefs = (node: Json): void => {
    if (Array.isArray(node)) {
      node.forEach(walkRefs);
      return;
    }
    if (!isObject(node)) return;
    const ref = node.$ref;
    if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
      const target = ref.slice("#/definitions/".length);
      const to = renames.get(target);
      if (to) node.$ref = `#/definitions/${to}`;
    }
    Object.values(node).forEach(walkRefs);
  };
  walkRefs(spec);
}

/**
 * Applies the Swagger-2.0-level fixes that must happen BEFORE conversion,
 * because swagger2openapi derives OpenAPI structure from them.
 */
function preConvert(spec: Obj): void {
  // (1) The document declares `host` but neither `schemes` nor `basePath`.
  // Without `schemes`, swagger2openapi emits a protocol-relative server URL,
  // which is not a usable base URL in Node. The API is HTTPS-only (HTTP
  // redirects), so pin it.
  spec.schemes = ["https"];
  spec.basePath = "/";

  // (2) Query array parameters are named with a Rails/Grape bracket suffix
  // (`account_class_ids[]`), meaning "repeat the key per value". Upstream omits
  // `collectionFormat`, so the Swagger 2.0 default (`csv`) applies and the
  // converter would emit `explode: false` -- serializing
  // `?account_class_ids[]=1,2` instead of the `?account_class_ids[]=1&account_class_ids[]=2`
  // the API actually parses. `multi` is the correct declaration.
  const walkParams = (node: Json): void => {
    if (Array.isArray(node)) {
      node.forEach(walkParams);
      return;
    }
    if (!isObject(node)) return;
    if (node.in === "query" && node.type === "array" && node.collectionFormat === undefined) {
      node.collectionFormat = "multi";
    }

    // (2b) Seven parameters (`per_page` on every paginated collection, and
    // friends) declare `default: null` on an `integer`. A null default is
    // meaningless -- it means "no default" -- but it survives conversion and
    // makes the generator emit `z.int().optional().default(null)`, which does
    // not typecheck. Drop the key rather than inventing a value, since we do
    // not know CareerPlug's real server-side default.
    if ("default" in node && node.default === null) {
      delete node.default;
    }

    Object.values(node).forEach(walkParams);
  };
  walkParams(spec);

  renameEntities(spec);
}

/**
 * Applies the OpenAPI-3-level fixes that must happen AFTER conversion.
 */
function postConvert(spec: Obj): void {
  spec.servers = [{ url: API_HOST, description: "CareerPlug API (production)" }];

  const components = (spec.components ??= {}) as Obj;

  // (3) Upstream declares ONLY the `access_token` query API key and omits the
  // OAuth 2.0 flows entirely -- even though every token must be minted through
  // Doorkeeper on a DIFFERENT host (`app.careerplug.com`, not the API host).
  // A consumer reading the raw upstream spec has no way to discover how to get
  // a token. Declare both supported grants explicitly.
  const securitySchemes = (components.securitySchemes ??= {}) as Obj;
  securitySchemes.api_key = {
    type: "apiKey",
    name: "access_token",
    in: "query",
    description:
      "OAuth 2.0 access token passed as a QUERY parameter (not an Authorization header). " +
      "This is how CareerPlug's Grape/WineBouncer API expects credentials.",
  };
  securitySchemes.oauth2 = {
    type: "oauth2",
    description:
      `Tokens are minted on ${OAUTH_HOST} (the Rails/Doorkeeper host), NOT on the API host. ` +
      "Access tokens expire after 48 hours. client_credentials issues NO refresh token -- " +
      "re-mint on expiry. authorization_code issues a refresh token, and its authorization " +
      "code must be exchanged within 10 minutes.",
    flows: {
      clientCredentials: {
        tokenUrl: `${OAUTH_HOST}/oauth/token`,
        scopes: {
          global_partner_api: "Global partner integration access.",
        },
      },
      authorizationCode: {
        authorizationUrl: `${OAUTH_HOST}/oauth/authorize`,
        tokenUrl: `${OAUTH_HOST}/oauth/token`,
        refreshUrl: `${OAUTH_HOST}/oauth/token`,
        scopes: {
          global_partner_api: "Global partner integration access.",
        },
      },
    },
  };

  // (4) `LocationEntity` has a property literally named `zip code` -- with a
  // space. It is valid JSON Schema and valid TypeScript (as a quoted key), so we
  // keep the wire name intact rather than silently renaming a field the API
  // really returns. Documented here so it is not mistaken for a generator bug.
  const schemas = components.schemas;
  if (isObject(schemas)) {
    const location = schemas.Location;
    if (isObject(location) && isObject(location.properties) && "zip code" in location.properties) {
      const prop = location.properties["zip code"];
      if (isObject(prop)) {
        prop.description = [prop.description, "Wire name contains a space: `zip code`."]
          .filter(Boolean)
          .join(" ");
      }
    }
  }

  // (5) Give the document a description. Upstream ships title + version only.
  const info = (spec.info ??= {}) as Obj;
  info.description =
    "CareerPlug API v1. Spec converted from the live Swagger 2.0 document at " +
    `${API_HOST}/swagger_doc. See the repository README for authentication, ` +
    "the partner job-feed surface, and known gaps.";
}

/** Returns a normalized OpenAPI 3.x copy of a Swagger 2.0 document. */
export async function normalizeSpec(swagger2: Json): Promise<Obj> {
  const source = structuredClone(swagger2) as Obj;
  preConvert(source);

  const { openapi } = await swagger2openapi.convertObj(source as never, {
    patch: true, // repair minor upstream schema violations instead of throwing
    warnOnly: true, // collect conversion warnings rather than aborting
    refSiblings: "preserve",
  });

  const result = openapi as unknown as Obj;
  postConvert(result);
  return result;
}
