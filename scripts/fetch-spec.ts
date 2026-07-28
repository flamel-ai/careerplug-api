/**
 * Downloads the CareerPlug Swagger 2.0 spec from the live API into `specs/`.
 *
 * Run with `pnpm fetch-spec` to refresh the vendored copies. Fetching requires
 * NO credentials -- `/swagger_doc` is served unauthenticated, which is what
 * makes this repo regenerable by anyone.
 *
 * Writes:
 *   specs/swagger_doc.json      the complete Swagger 2.0 document (generation input)
 *   specs/resources/<name>.json per-resource views, vendored for traceability only
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RESOURCES, ROOT_SPEC_URL, resourceSpecUrl } from "./spec-sources.js";

const here = dirname(fileURLToPath(import.meta.url));
const specsDir = join(here, "..", "specs");
const resourcesDir = join(specsDir, "resources");

/**
 * Fetches a URL and parses it as JSON, failing loudly on a non-2xx or on a body
 * that is not JSON. Grape returns an HTML error page in some failure modes, and
 * a truncated or HTML body must never be written into `specs/`.
 */
async function fetchJson(url: string): Promise<{ body: string; parsed: unknown }> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `Response from ${url} is not JSON (got ${body.length} bytes starting "${body.slice(0, 60)}")`,
    );
  }
  return { body, parsed };
}

async function main() {
  await mkdir(resourcesDir, { recursive: true });

  process.stdout.write(`Fetching ${ROOT_SPEC_URL} … `);
  const root = await fetchJson(ROOT_SPEC_URL);
  const doc = root.parsed as { swagger?: string; paths?: Record<string, unknown> };
  if (doc.swagger !== "2.0") {
    throw new Error(`Expected a Swagger 2.0 document, got swagger=${String(doc.swagger)}`);
  }
  const pathCount = Object.keys(doc.paths ?? {}).length;
  if (pathCount === 0) {
    throw new Error("Root spec contains zero paths -- refusing to overwrite specs/");
  }
  await writeFile(join(specsDir, "swagger_doc.json"), root.body, "utf8");
  console.log(`${pathCount} paths, ${(root.body.length / 1024).toFixed(1)} KB`);

  for (const resource of RESOURCES) {
    const url = resourceSpecUrl(resource);
    process.stdout.write(`Fetching ${resource} … `);
    const { body, parsed } = await fetchJson(url);
    const sub = parsed as { paths?: Record<string, unknown> };
    await writeFile(join(resourcesDir, `${resource}.json`), body, "utf8");
    console.log(`${Object.keys(sub.paths ?? {}).length} paths`);
  }

  // Drift check: the root document is the generation input, so anything a
  // per-resource view exposes but the root omits would silently never be
  // generated. Warn loudly rather than failing -- a new resource is news, not
  // an error.
  const rootPaths = new Set(Object.keys(doc.paths ?? {}));
  const seen = new Set<string>();
  for (const resource of RESOURCES) {
    const sub = JSON.parse(
      await (await fetch(resourceSpecUrl(resource))).text(),
    ) as { paths?: Record<string, unknown> };
    for (const p of Object.keys(sub.paths ?? {})) seen.add(p);
  }
  const missingFromRoot = [...seen].filter((p) => !rootPaths.has(p));
  if (missingFromRoot.length > 0) {
    console.warn(
      `\n!! These paths appear in a per-resource view but NOT in the root spec ` +
        `(they will not be generated): ${missingFromRoot.join(", ")}`,
    );
  }

  console.log(`\nVendored the root spec + ${RESOURCES.length} resource views into specs/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
