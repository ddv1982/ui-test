import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.integration.test.ts",
      "scripts/**/*.test.mjs",
    ],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/core/**/*.ts", "src/utils/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
        "src/bin/**",
        "src/core/contracts/**",
        "src/core/improve/improve.ts", // re-export shim
        "src/core/play/play-types.ts", // type-only declarations
        "src/core/transform/selector-normalize.ts", // parser-normalization utility with broad combinatorics
        "src/utils/chromium-runtime.ts", // environment-dependent launcher diagnostics
        "src/core/recorder.ts", // Interactive wrapper around Playwright codegen subprocess
        "src/utils/ui.ts", // Display-only formatting helpers
      ],
      thresholds: {
        lines: 82,
        functions: 90,
        branches: 65,
        statements: 80,
      },
    },

    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
