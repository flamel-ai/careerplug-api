/**
 * Generates `docs/endpoints.md` from `specs/openapi.json`.
 *
 * The endpoint reference is derived, never hand-maintained, so it cannot drift
 * from the spec. Run via `pnpm gen-docs` (included in `pnpm refresh`).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

interface Param {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: { type?: string; items?: { type?: string }; format?: string };
}

interface Operation {
  operationId?: string;
  description?: string;
  parameters?: Param[];
  responses?: Record<string, { description?: string }>;
  tags?: string[];
}

type Schema = {
  type?: string;
  description?: string;
  properties?: Record<string, { type?: string; description?: string; $ref?: string; items?: unknown }>;
};

const typeOf = (p: Param): string => {
  const s = p.schema;
  if (!s) return "—";
  if (s.type === "array") return `${s.items?.type ?? "any"}[]`;
  return s.type ?? "—";
};

const clean = (text: string | undefined): string =>
  (text ?? "").replace(/\s*<br>\s*/g, " ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

const refName = (ref: string): string => ref.split("/").pop() ?? ref;

function describeProp(prop: { type?: string; $ref?: string; items?: unknown }): string {
  if (prop.$ref) return `[${refName(prop.$ref)}](#${refName(prop.$ref).toLowerCase()})`;
  if (prop.type === "array") {
    const items = prop.items as { $ref?: string; type?: string } | undefined;
    if (items?.$ref) return `[${refName(items.$ref)}](#${refName(items.$ref).toLowerCase()})[]`;
    return `${items?.type ?? "any"}[]`;
  }
  return prop.type ?? "object";
}

async function main() {
  const spec = JSON.parse(await readFile(join(root, "specs", "openapi.json"), "utf8"));
  const out: string[] = [];

  out.push("# Endpoint reference");
  out.push("");
  out.push(
    "> Generated from [`specs/openapi.json`](../specs/openapi.json) by `scripts/gen-docs.ts`. " +
      "Do not edit by hand -- run `pnpm gen-docs`.",
  );
  out.push("");
  out.push(`Base URL: \`${spec.servers[0].url}\``);
  out.push("");
  out.push(
    "There is **no version prefix** in the paths -- it is `/jobs`, not `/v1/jobs`. Every request " +
      "carries its token as the `access_token` query parameter.",
  );
  out.push("");

  // Group operations by tag so the page mirrors the Swagger UI's tabs.
  const byTag = new Map<string, Array<{ method: string; path: string; op: Operation }>>();
  for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, Operation>>)) {
    for (const [method, op] of Object.entries(item)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const tag = op.tags?.[0] ?? "other";
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({ method: method.toUpperCase(), path, op });
    }
  }

  out.push("## Operations");
  out.push("");
  for (const tag of [...byTag.keys()].sort()) {
    out.push(`### \`${tag}\``);
    out.push("");
    for (const { method, path, op } of byTag.get(tag)!.sort((a, b) => a.path.localeCompare(b.path))) {
      out.push(`#### \`${method} ${path}\``);
      out.push("");
      out.push(`TypeScript: \`${op.operationId ?? "—"}()\``);
      out.push("");
      if (op.description) {
        out.push(clean(op.description));
        out.push("");
      }
      const params = op.parameters ?? [];
      if (params.length > 0) {
        out.push("| Parameter | In | Type | Required | Description |");
        out.push("|---|---|---|---|---|");
        for (const p of params) {
          out.push(
            `| \`${p.name}\` | ${p.in} | ${typeOf(p)} | ${p.required ? "yes" : "no"} | ${clean(p.description) || "—"} |`,
          );
        }
        out.push("");
      }
      const responses = Object.entries(op.responses ?? {});
      if (responses.length > 0) {
        out.push("Responses:");
        out.push("");
        for (const [code, res] of responses) {
          out.push(`- \`${code}\` — ${clean(res.description) || "—"}`);
        }
        out.push("");
      }
    }
  }

  out.push("## Models");
  out.push("");
  const schemas = spec.components.schemas as Record<string, Schema>;
  for (const name of Object.keys(schemas).sort()) {
    const schema = schemas[name]!;
    out.push(`### ${name}`);
    out.push("");
    if (schema.description) {
      out.push(clean(schema.description));
      out.push("");
    }
    const props = Object.entries(schema.properties ?? {});
    if (props.length === 0) {
      out.push("_No declared properties._");
      out.push("");
      continue;
    }
    out.push("| Field | Type | Description |");
    out.push("|---|---|---|");
    for (const [propName, prop] of props) {
      // Backtick-quote so the `zip code` field (which really does contain a
      // space) renders as a wire name rather than looking like a typo.
      out.push(`| \`${propName}\` | ${describeProp(prop)} | ${clean(prop.description) || "—"} |`);
    }
    out.push("");
  }

  await writeFile(join(root, "docs", "endpoints.md"), `${out.join("\n")}\n`, "utf8");
  console.log(
    `Wrote docs/endpoints.md (${[...byTag.values()].flat().length} operations, ` +
      `${Object.keys(schemas).length} models)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
