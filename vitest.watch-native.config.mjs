import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "mobile/src"),
      "@shared": resolve(import.meta.dirname, "src/lib"),
    },
  },
  test: {
    include: ["mobile/src/health/watch-*.test.mjs"],
    environment: "node",
    fileParallelism: false,
    hookTimeout: 35_000,
  },
});
