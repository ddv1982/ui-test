import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "e2e/**",
      "examples/**",
      "node_modules/**",
      "tests/**",
      ".ui-test-artifacts/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "off",
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
