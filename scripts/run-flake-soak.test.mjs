import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLAKE_TEST_FILES,
  resolveFlakeIterations,
  resolveFlakeReportPath,
  resolveFlakeTestFiles,
} from "./run-flake-soak.mjs";

describe("run-flake-soak config", () => {
  it("uses sane defaults", () => {
    expect(resolveFlakeIterations({})).toBe(5);
    expect(resolveFlakeTestFiles({})).toEqual(DEFAULT_FLAKE_TEST_FILES);
  });

  it("parses custom iterations and rejects invalid values", () => {
    expect(resolveFlakeIterations({ UI_TEST_FLAKE_ITERATIONS: "9" })).toBe(9);
    expect(() => resolveFlakeIterations({ UI_TEST_FLAKE_ITERATIONS: "0" })).toThrow(
      /Invalid UI_TEST_FLAKE_ITERATIONS/
    );
  });

  it("parses custom test file list and removes duplicates", () => {
    expect(
      resolveFlakeTestFiles({
        UI_TEST_FLAKE_TEST_FILES: "a.test.ts, b.test.ts, a.test.ts",
      })
    ).toEqual(["a.test.ts", "b.test.ts"]);
  });

  it("resolves default and custom report paths", () => {
    const now = new Date("2026-02-22T10:00:00.000Z");
    const defaultPath = resolveFlakeReportPath({}, now);
    expect(defaultPath).toContain(".ui-test-artifacts/flake-soak/flake-soak-2026-02-22T10-00-00-000Z.json");

    const customPath = resolveFlakeReportPath({ UI_TEST_FLAKE_REPORT_PATH: "tmp/flake.json" }, now);
    expect(customPath).toMatch(/tmp\/flake\.json$/);
  });
});
