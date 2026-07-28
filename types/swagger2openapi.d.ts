/**
 * Minimal ambient types for `swagger2openapi`, which ships no declarations.
 *
 * We only use `convertObj`, so we declare exactly that rather than pulling in a
 * speculative full typing of the package.
 */
declare module "swagger2openapi" {
  export interface ConvertOptions {
    /** Repair minor upstream schema violations instead of throwing. */
    patch?: boolean;
    /** Collect conversion warnings rather than aborting. */
    warnOnly?: boolean;
    /** How to handle siblings of `$ref` keywords. */
    refSiblings?: "remove" | "preserve" | "allOf";
    [key: string]: unknown;
  }

  export interface ConvertResult {
    /** The converted OpenAPI 3.x document. */
    openapi: Record<string, unknown>;
    options: ConvertOptions;
  }

  export function convertObj(
    swagger: Record<string, unknown>,
    options: ConvertOptions,
  ): Promise<ConvertResult>;

  const _default: { convertObj: typeof convertObj };
  export default _default;
}
