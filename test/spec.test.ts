/**
 * Guards the spec-normalization contract. Every assertion here corresponds to a
 * real defect in CareerPlug's upstream Swagger document; if a refresh silently
 * reverts one, these fail rather than shipping a subtly broken client.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const openapi = JSON.parse(readFileSync(join(root, "specs", "openapi.json"), "utf8"));
const swagger2 = JSON.parse(readFileSync(join(root, "specs", "swagger_doc.json"), "utf8"));

describe("vendored upstream spec", () => {
  it("is an unmodified Swagger 2.0 document", () => {
    expect(swagger2.swagger).toBe("2.0");
    expect(swagger2.info.title).toBe("CareerPlug API Integration Documentation");
  });

  it("still declares only the api_key security definition upstream", () => {
    // If CareerPlug ever documents OAuth themselves, we can drop our injected
    // securityScheme. This test tells us when that happens.
    expect(Object.keys(swagger2.securityDefinitions)).toEqual(["api_key"]);
  });
});

describe("normalized OpenAPI document", () => {
  it("is OpenAPI 3.x", () => {
    expect(String(openapi.openapi)).toMatch(/^3\./);
  });

  it("pins an absolute https server URL (upstream ships host with no schemes)", () => {
    expect(openapi.servers).toEqual([
      { url: "https://api.careerplug.com", description: "CareerPlug API (production)" },
    ]);
  });

  it("preserves every upstream path", () => {
    expect(Object.keys(openapi.paths).sort()).toEqual(Object.keys(swagger2.paths).sort());
  });

  it("exposes the documented resource endpoints", () => {
    for (const path of ["/jobs", "/jobs/{id}", "/locations", "/brands", "/departments", "/employments", "/users", "/apps"]) {
      expect(openapi.paths).toHaveProperty(path);
    }
  });

  it("strips Grape's V1_Entities_ prefix from model names", () => {
    const schemas = Object.keys(openapi.components.schemas);
    expect(schemas).toContain("Job");
    expect(schemas).toContain("Location");
    expect(schemas).toContain("Applicant");
    expect(schemas.some((n) => n.startsWith("V1_Entities_"))).toBe(false);
  });

  it("leaves no dangling $ref after the entity rename", () => {
    const defined = new Set(Object.keys(openapi.components.schemas));
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== "object" || node === null) return;
      const ref = (node as { $ref?: unknown }).$ref;
      if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
        refs.push(ref.slice("#/components/schemas/".length));
      }
      Object.values(node).forEach(walk);
    };
    walk(openapi);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !defined.has(r))).toEqual([]);
  });

  it("declares the OAuth flows upstream omits, on the correct (OAuth) host", () => {
    const oauth = openapi.components.securitySchemes.oauth2;
    expect(oauth.type).toBe("oauth2");
    expect(oauth.flows.clientCredentials.tokenUrl).toBe("https://app.careerplug.com/oauth/token");
    expect(oauth.flows.authorizationCode.authorizationUrl).toBe(
      "https://app.careerplug.com/oauth/authorize",
    );
    // The token host must NOT be the API host -- conflating them is the single
    // most common CareerPlug integration mistake.
    expect(oauth.flows.clientCredentials.tokenUrl).not.toContain("api.careerplug.com");
  });

  it("keeps the token in the query string, matching what the API accepts", () => {
    expect(openapi.components.securitySchemes.api_key).toMatchObject({
      type: "apiKey",
      name: "access_token",
      in: "query",
    });
  });

  it("serializes bracketed array params as repeated keys, not a CSV join", () => {
    const param = openapi.paths["/jobs"].get.parameters.find(
      (p: { name: string }) => p.name === "account_class_ids[]",
    );
    expect(param).toBeDefined();
    // Swagger 2.0 defaults query arrays to `csv`; the Rails/Grape `[]` suffix
    // means repeat-the-key. explode:true is what produces that.
    expect(param.explode).toBe(true);
    expect(param.schema.type).toBe("array");
  });

  it("drops the meaningless `default: null` upstream puts on integer params", () => {
    const walk = (node: unknown): number => {
      if (Array.isArray(node)) return node.reduce<number>((n, v) => n + walk(v), 0);
      if (typeof node !== "object" || node === null) return 0;
      const self = "default" in node && (node as { default: unknown }).default === null ? 1 : 0;
      return self + Object.values(node).reduce<number>((n, v) => n + walk(v), 0);
    };
    // Upstream really does ship these -- assert we saw some, so this test
    // cannot silently pass because the quirk moved.
    expect(walk(swagger2)).toBeGreaterThan(0);
    expect(walk(openapi)).toBe(0);
  });

  it("keeps the `zip code` wire name intact rather than silently renaming it", () => {
    // It has a space. That is genuinely what the API returns.
    expect(openapi.components.schemas.Location.properties).toHaveProperty("zip code");
  });
});
