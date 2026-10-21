import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["mobile/src/health/watch-*.test.mjs"],
    environment: "node",
    fileParallelism: false,
    hookTimeout: 35_000,
  },
});
