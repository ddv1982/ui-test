import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
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

import { confirm } from "@inquirer/prompts";
import { improveTestFile } from "../../core/improve/improve.js";
import { runImprove } from "./improve-service.js";

describe("runImprove chromium handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(confirm).mockResolvedValue(false);
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
        "Run: ui-test setup or npx playwright install chromium"
      )
    );

    const run = runImprove("e2e/sample.yaml", {});

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup"),
    });
    expect(improveTestFile).toHaveBeenCalledTimes(1);
  });

  it("executes improve flow when chromium is available", async () => {
    await runImprove("e2e/sample.yaml", {});

    expect(improveTestFile).toHaveBeenCalledTimes(1);
  });
});

describe("runImprove confirm prompt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
          assertionApplyStatusCounts: {},
          assertionCandidateSourceCounts: {},
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });
  });

  it("prompts when apply is undefined and passes true through", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await runImprove("e2e/sample.yaml", {});

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith({
      message: "Apply improvements to sample.yaml?",
      default: true,
    });
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({ applySelectors: true, applyAssertions: true })
    );
  });

  it("does not prompt when apply is true", async () => {
    await runImprove("e2e/sample.yaml", { apply: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({ applySelectors: true, applyAssertions: true })
    );
  });

  it("does not prompt when apply is false", async () => {
    await runImprove("e2e/sample.yaml", { apply: false });

    expect(confirm).not.toHaveBeenCalled();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({ applySelectors: false, applyAssertions: false })
    );
  });

  it("respects user declining the prompt", async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    await runImprove("e2e/sample.yaml", {});

    expect(confirm).toHaveBeenCalledOnce();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({ applySelectors: false, applyAssertions: false })
    );
  });
});
