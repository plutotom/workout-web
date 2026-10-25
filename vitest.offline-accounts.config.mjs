import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const requireMobile = createRequire(
  path.resolve(import.meta.dirname, "mobile/package.json"),
);

export default defineConfig({
  resolve: {
    alias: {
      "react-test-renderer": requireMobile.resolve("react-test-renderer"),
      "react-native": requireMobile.resolve("react-native"),
      "expo-sqlite": requireMobile.resolve("expo-sqlite"),
      "expo-crypto": requireMobile.resolve("expo-crypto"),
      "expo-secure-store": requireMobile.resolve("expo-secure-store"),
      "expo-web-browser": requireMobile.resolve("expo-web-browser"),
      "@": path.resolve(import.meta.dirname, "mobile/src"),
      "@backend": path.resolve(import.meta.dirname, "backend/_generated"),
      "@shared": path.resolve(import.meta.dirname, "src/lib"),
    },
  },
  test: {
    include: ["tests/offline-accounts/**/*.test.js"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
