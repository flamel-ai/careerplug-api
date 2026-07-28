/**
 * Generates the CareerPlug SDK from the vendored Swagger 2.0 spec.
 *
 * Pipeline:  specs/swagger_doc.json  (untouched upstream copy)
 *              -> normalizeSpec()    (fixes + Swagger 2.0 -> OpenAPI 3.x)
 *              -> specs/openapi.json (committed, the published OpenAPI artifact)
 *              -> @hey-api/openapi-ts -> src/generated/
 *
 * Emits into `src/generated/`:
 *   types.gen.ts   typed request/response models
 *   zod.gen.ts     zod schemas for every model
 *   sdk.gen.ts     fetch-based SDK functions with response validation
 *   client.gen.ts  bundled fetch client instance
 *   index.ts       barrel re-export
 *
 * Run with `pnpm generate`, or `pnpm refresh` to re-pull the spec first.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@hey-api/openapi-ts";

import { normalizeSpec } from "./normalize-spec.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const specsDir = join(root, "specs");
const outDir = join(root, "src", "generated");
// Scratch copy fed to the generator. Gitignored; `specs/openapi.json` is the
// committed artifact.
const genSpecsDir = join(root, ".gen-specs");

async function main() {
  const rawPath = join(specsDir, "swagger_doc.json");
  if (!existsSync(rawPath)) {
    throw new Error(`Missing ${rawPath}. Run \`pnpm fetch-spec\` first.`);
  }

  await mkdir(genSpecsDir, { recursive: true });

  console.log("▶ Normalizing Swagger 2.0 → OpenAPI 3.x");
  const swagger2 = JSON.parse(await readFile(rawPath, "utf8"));
  const openapi = await normalizeSpec(swagger2);

  const pathCount = Object.keys((openapi.paths as object) ?? {}).length;
  const schemaCount = Object.keys(
    ((openapi.components as Record<string, object>)?.schemas as object) ?? {},
  ).length;
  console.log(
    `  openapi=${String(openapi.openapi)}  paths=${pathCount}  schemas=${schemaCount}`,
  );
  if (pathCount === 0) throw new Error("Normalized spec has zero paths -- aborting");

  // Commit the converted OpenAPI document: it is a published artifact of this
  // repo (exported as `@flamel-ai/careerplug-api/specs/openapi.json`), so
  // consumers on other stacks can generate their own clients from it.
  const prettyOpenapi = `${JSON.stringify(openapi, null, 2)}\n`;
  await writeFile(join(specsDir, "openapi.json"), prettyOpenapi, "utf8");
  await writeFile(join(genSpecsDir, "openapi.json"), JSON.stringify(openapi), "utf8");
  console.log(`  wrote specs/openapi.json (${(prettyOpenapi.length / 1024).toFixed(1)} KB)`);

  console.log("\n▶ Generating SDK → src/generated/");
  await createClient({
    input: join(genSpecsDir, "openapi.json"),
    output: { path: outDir, format: null, lint: null },
    plugins: [
      "@hey-api/typescript",
      "@hey-api/client-fetch",
      "zod",
      {
        name: "@hey-api/sdk",
        // Validate RESPONSES against the zod schemas. Request validation is off:
        // the auth layer injects `access_token` outside the generated call
        // signature, so a request-side validator would reject valid calls.
        validator: { response: true, request: false },
      },
    ],
  });

  console.log("\n✔ Done. Generated code is committed under src/generated/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
