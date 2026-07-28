import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/auth.ts", "src/feeds.ts", "src/errors.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
