import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/core/**/*.ts", "src/utils/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
        "src/bin/**",
        "src/core/recorder.ts", // Interactive wrapper around Playwright codegen subprocess
        "src/utils/ui.ts", // Display-only formatting helpers
      ],
      thresholds: {
        lines: 60,
        functions: 100,
        branches: 50,
        statements: 60,
      },
    },

    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
