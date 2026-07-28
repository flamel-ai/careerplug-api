import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    // Live network calls; the default 5s is too tight for a cold CloudFront hit.
    testTimeout: 30_000,
  },
});
