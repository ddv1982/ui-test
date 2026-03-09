import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  PARITY_SUITE_PATTERNS,
  resolveParityTestFiles,
} from "./run-headed-parity.mjs";

describe("run-headed-parity resolver", () => {
  it("resolves all configured parity suites", async () => {
    const files = await resolveParityTestFiles(PARITY_SUITE_PATTERNS, process.cwd());

    expect(files).toContain("src/core/play/player-runner.integration.test.ts");
    expect(files).toContain("src/core/improve/improve.dynamic.integration.test.ts");
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("fails when a configured suite resolves to zero tests", async () => {
    await expect(
      resolveParityTestFiles(
        [{ id: "missing-suite", patterns: ["src/**/does-not-exist.integration.test.ts"] }],
        process.cwd()
      )
    ).rejects.toThrow(/resolved to zero test files/);
  });

  it("deduplicates and sorts matched files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ui-test-parity-resolve-"));

    try {
      const a = path.join(dir, "b.integration.test.ts");
      const b = path.join(dir, "a.integration.test.ts");
      await writeFile(a, "", "utf-8");
      await writeFile(b, "", "utf-8");

      const files = await resolveParityTestFiles(
        [
          { id: "suite-a", patterns: ["*.integration.test.ts"] },
          { id: "suite-b", patterns: ["a.integration.test.ts"] },
        ],
        dir
      );

      expect(files).toEqual(["a.integration.test.ts", "b.integration.test.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
