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
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          exclude: [...configDefaults.exclude, "mobile/**", "**/.worktrees/**"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@": path.resolve(import.meta.dirname, "mobile/src"),
          },
        },
        test: { name: "mobile", include: ["mobile/**/*.test.{js,ts,tsx}"] },
      },
    ],
  },
});
