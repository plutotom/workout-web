import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  globalIgnores([
    "backend/_generated/**",
    "ios/**",
    ".pnpm-store/**",
    ".vercel/**",
  ]),
  eslintConfigPrettier,
]);

export default eslintConfig;
