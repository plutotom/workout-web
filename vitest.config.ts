import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "src/lib"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "ios/**"],
  },
});
