import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

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
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports" },
      ],
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
