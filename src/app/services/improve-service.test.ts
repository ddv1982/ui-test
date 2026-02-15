import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("../../utils/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../core/improve/improve.js", () => ({
  improveTestFile: vi.fn(),
}));

vi.mock("../../utils/ui.js", () => ({
  ui: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    dim: vi.fn(),
    heading: vi.fn(),
  },
}));

import { loadConfig } from "../../utils/config.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { runImprove } from "./improve-service.js";

describe("runImprove chromium handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      improveApplyMode: "review",
      improveApplyAssertions: false,
      improveAssertionSource: "snapshot-native",
      improveAssertionApplyPolicy: "reliable",
      improveAssertions: "candidates",
    });
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 0,
          skippedAssertions: 0,
          assertionApplyPolicy: "reliable",
          assertionApplyStatusCounts: {},
          assertionCandidateSourceCounts: {},
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });
  });

  it("fails fast with remediation when chromium is unavailable", async () => {
    vi.mocked(improveTestFile).mockRejectedValueOnce(
      new UserError(
        "Chromium browser is not installed.",
        "Run: ui-test setup quickstart or npx playwright install chromium"
      )
    );

    const run = runImprove("e2e/sample.yaml", {});

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup quickstart"),
    });
    expect(improveTestFile).toHaveBeenCalledTimes(1);
  });

  it("executes improve flow when chromium is available", async () => {
    await runImprove("e2e/sample.yaml", {});

    expect(improveTestFile).toHaveBeenCalledTimes(1);
  });
});
