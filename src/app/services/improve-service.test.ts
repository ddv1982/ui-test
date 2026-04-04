import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

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
import fs from "node:fs/promises";
import { improveTestFile } from "../../core/improve/improve.js";
import type { ImproveReport } from "../../core/improve/report-schema.js";
import { hashImprovePlanSource } from "../../core/improve/improve-plan.js";
import { ui } from "../../utils/ui.js";
import { runImprove } from "./improve-service.js";

const SAMPLE_YAML = "name: sample\nsteps:\n  - action: navigate\n    url: /\n";
const SAFE_DETERMINISM: ImproveReport["determinism"] = { status: "safe", reasons: [] };

describe("runImprove chromium handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(SAMPLE_YAML);
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
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
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(SAMPLE_YAML);
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
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
      message: "Write improved copy to sample.improved.yaml?",
      default: true,
    });
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringContaining("sample.improved.yaml"),
        applySelectors: true,
        applyAssertions: true,
        appliedBy: "manual_apply",
      })
    );
  });

  it("does not prompt when apply is true", async () => {
    await runImprove("e2e/sample.yaml", { apply: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringContaining("sample.improved.yaml"),
        applySelectors: true,
        applyAssertions: true,
        appliedBy: "manual_apply",
      })
    );
  });

  it("supports --in-place and does not set outputPath", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await runImprove("e2e/sample.yaml", { inPlace: true });

    expect(confirm).toHaveBeenCalledWith({
      message: "Apply improvements in-place to sample.yaml?",
      default: true,
    });

    const args = vi.mocked(improveTestFile).mock.calls[0]?.[0];
    expect(args).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(args, "outputPath")).toBe(false);
  });

  it("rejects combining --output with --in-place", async () => {
    await expect(
      runImprove("e2e/sample.yaml", { apply: true, output: "out.yaml", inPlace: true })
    ).rejects.toBeInstanceOf(UserError);
  });

  it("does not prompt when apply is false", async () => {
    await runImprove("e2e/sample.yaml", { apply: false });

    expect(confirm).not.toHaveBeenCalled();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: false,
        applyAssertions: false,
        appliedBy: "report_only",
      })
    );
  });

  it("respects user declining the prompt", async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    await runImprove("e2e/sample.yaml", {});

    expect(confirm).toHaveBeenCalledOnce();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: false,
        applyAssertions: false,
        appliedBy: "report_only",
      })
    );
  });

  it("prints retained summary using canonical field", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 0,
          skippedAssertions: 0,
          runtimeFailingStepsRetained: 2,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });

    await runImprove("e2e/sample.yaml", { apply: false });

    expect(ui.info).toHaveBeenCalledWith(
      expect.stringContaining("runtimeFailingStepsRetained=2")
    );
  });

  it("prints assertion coverage metrics in summary output", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 4,
          appliedAssertions: 2,
          skippedAssertions: 2,
          assertionCoverageStepsTotal: 5,
          assertionCoverageStepsWithCandidates: 4,
          assertionCoverageStepsWithApplied: 2,
          assertionCoverageCandidateRate: 0.8,
          assertionCoverageAppliedRate: 0.4,
          assertionFallbackApplied: 1,
          assertionFallbackAppliedOnlySteps: 1,
          assertionFallbackAppliedWithNonFallbackSteps: 0,
          assertionInventoryStepsEvaluated: 3,
          assertionInventoryCandidatesAdded: 2,
          assertionInventoryGapStepsFilled: 2,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });

    await runImprove("e2e/sample.yaml", { apply: false });

    expect(
      vi
        .mocked(ui.info)
        .mock.calls.some(
          ([message]) =>
            typeof message === "string" &&
            message.includes("assertionCoverageStepsTotal=5") &&
            message.includes("assertionCoverageStepsWithCandidates=4") &&
            message.includes("assertionCoverageStepsWithApplied=2") &&
            message.includes("assertionCoverageCandidateRate=0.8") &&
            message.includes("assertionCoverageAppliedRate=0.4") &&
            message.includes("assertionFallbackApplied=1") &&
            message.includes("assertionFallbackAppliedOnlySteps=1") &&
            message.includes("assertionFallbackAppliedWithNonFallbackSteps=0") &&
            message.includes("assertionInventoryStepsEvaluated=3") &&
            message.includes("assertionInventoryCandidatesAdded=2") &&
            message.includes("assertionInventoryGapStepsFilled=2")
        )
    ).toBe(true);
  });

  it("prints unsafe determinism verdict when runtime-derived apply is report-only", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: {
          status: "unsafe",
          reasons: ["missing_base_url", "cross_origin_drift"],
          suppressedMutationTypes: ["selector_update", "assertion_insert"],
        },
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 1,
          assertionCandidates: 1,
          appliedAssertions: 0,
          skippedAssertions: 1,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });

    await runImprove("e2e/sample.yaml", { apply: false });

    expect(ui.warn).toHaveBeenCalledWith(
      "Determinism: unsafe (missing baseUrl, cross-origin drift) — runtime selector apply blocked, runtime assertion apply blocked; recommendations kept report-only"
    );
  });

  it("prints safe determinism verdict when runtime-derived apply is allowed", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      outputPath: undefined,
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "manual_apply",
        determinism: {
          status: "safe",
          reasons: [],
        },
        summary: {
          unchanged: 1,
          improved: 1,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 1,
          appliedAssertions: 1,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
    });

    await runImprove("e2e/sample.yaml", { apply: true });

    expect(ui.info).toHaveBeenCalledWith(
      "Determinism: safe — runtime-derived auto-apply allowed."
    );
  });
});

describe("runImprove plan/apply-plan modes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(SAMPLE_YAML);
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "plan_preview",
        determinism: {
          status: "safe",
          reasons: [],
        },
        summary: {
          unchanged: 0,
          improved: 1,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 1,
          appliedAssertions: 1,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
      proposedTest: {
        name: "sample",
        steps: [{ action: "navigate", url: "/" }],
      },
    });
  });

  it("generates plan file in --plan mode without prompting", async () => {
    await runImprove("e2e/sample.yaml", { plan: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRunWrite: true,
        includeProposedTest: true,
        appliedBy: "plan_preview",
      })
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("e2e/sample.improve-plan.json"),
      expect.stringContaining("\"version\": 2"),
      "utf-8"
    );

    const planWrite = vi.mocked(fs.writeFile).mock.calls.find(([filePath]) =>
      String(filePath).endsWith("sample.improve-plan.json")
    );
    const serializedPlan = String(planWrite?.[1] ?? "");
    expect(serializedPlan).toContain('"summary"');
    expect(serializedPlan).toContain('"determinism"');
    expect(serializedPlan).toContain('"diagnostics"');
    expect(serializedPlan).toContain('"assertionCandidates"');
  });

  it("generates deterministic candidate and diagnostic ordering in plan mode", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      reportPath: "e2e/sample.improve-report.json",
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "plan_preview",
        determinism: {
          status: "unsafe",
          reasons: ["missing_base_url"],
          suppressedMutationTypes: ["selector_update"],
        },
        summary: {
          unchanged: 0,
          improved: 1,
          fallback: 0,
          warnings: 2,
          assertionCandidates: 2,
          appliedAssertions: 0,
          skippedAssertions: 2,
          runtimeFailingStepsRetained: 1,
          runtimeFailingStepsRemoved: 0,
        },
        stepFindings: [],
        assertionCandidates: [
          {
            index: 1,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#status", kind: "css", source: "manual" },
            },
            confidence: 0.76,
            rationale: "visible",
            applyStatus: "skipped_policy",
          },
          {
            index: 0,
            afterAction: "fill",
            candidate: {
              action: "assertValue",
              target: { value: "#name", kind: "css", source: "manual" },
              value: "Alice",
            },
            confidence: 0.9,
            rationale: "stable",
            applyStatus: "skipped_low_confidence",
          },
        ],
        diagnostics: [
          {
            code: "z_code",
            level: "warn",
            message: "z message",
          },
          {
            code: "a_code",
            level: "info",
            message: "a message",
          },
        ],
      },
      proposedTest: {
        name: "sample",
        steps: [{ action: "navigate", url: "/" }],
      },
    });

    await runImprove("e2e/sample.yaml", { plan: true });

    const planWrite = vi.mocked(fs.writeFile).mock.calls.find(([filePath]) =>
      String(filePath).endsWith("sample.improve-plan.json")
    );
    const plan = JSON.parse(String(planWrite?.[1] ?? "{}")) as {
      diagnostics: Array<{ code: string }>;
      assertionCandidates: Array<{ candidate: { action: string } }>;
    };

    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "a_code",
      "z_code",
    ]);
    expect(plan.assertionCandidates.map((candidate) => candidate.candidate.action)).toEqual([
      "assertValue",
      "assertVisible",
    ]);
    expect(vi.mocked(ui.warn)).toHaveBeenCalledWith(
      "Determinism: unsafe (missing baseUrl) — runtime selector apply blocked; recommendations kept report-only"
    );
  });

  it("stores effective apply flags when assertions are disabled in plan mode", async () => {
    await runImprove("e2e/sample.yaml", { plan: true, assertions: "none" });

    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: true,
        applyAssertions: false,
        assertions: "none",
      })
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("e2e/sample.improve-plan.json"),
      expect.stringContaining("\"applyAssertions\": false"),
      "utf-8"
    );
  });

  it("rejects conflicting --plan and --apply-plan options", async () => {
    await expect(
      runImprove("e2e/sample.yaml", {
        plan: true,
        applyPlan: "e2e/sample.improve-plan.json",
      })
    ).rejects.toThrow(/Cannot use --plan together with --apply-plan/);
  });

  it("rejects write-target flags in plan mode", async () => {
    await expect(
      runImprove("e2e/sample.yaml", {
        plan: true,
        output: "out.yaml",
      })
    ).rejects.toThrow(/Cannot use --output or --in-place together with --plan/);
  });

  it("rejects apply flags in plan mode", async () => {
    await expect(
      runImprove("e2e/sample.yaml", {
        plan: true,
        apply: true,
      })
    ).rejects.toThrow(/Cannot use --apply or --no-apply together with --plan/);
  });

  it("applies a generated plan to a copy by default", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith("sample.improve-plan.json")) {
        return JSON.stringify({
          version: 2,
          generatedAt: new Date().toISOString(),
          testFile: "sample.yaml",
          testFileLocator: "relative_to_plan",
          testFileSha256: hashImprovePlanSource(SAMPLE_YAML),
          sourceReportPath: "sample.improve-report.json",
          sourceReportPathLocator: "relative_to_plan",
          appliedBy: "plan_preview",
          determinism: {
            status: "unsafe",
            reasons: ["missing_base_url"],
            suppressedMutationTypes: ["selector_update"],
          },
          profile: {
            assertions: "candidates",
            assertionSource: "snapshot-native",
            assertionPolicy: "balanced",
            applySelectors: true,
            applyAssertions: true,
          },
          summary: {
            runtimeFailingStepsRetained: 1,
            runtimeFailingStepsRemoved: 0,
            skippedAssertions: 2,
          },
          diagnostics: [
            {
              code: "runtime_failing_step_retained",
              level: "info",
              message: "retained",
            },
          ],
          assertionCandidates: [
            {
              index: 1,
              afterAction: "click",
              candidate: {
                action: "assertVisible",
                target: { value: "#status", kind: "css", source: "manual" },
              },
              confidence: 0.76,
              rationale: "visible",
              applyStatus: "skipped_policy",
            },
          ],
          test: {
            name: "sample",
            steps: [{ action: "navigate", url: "/" }],
          },
        });
      }
      return SAMPLE_YAML;
    });

    await runImprove("e2e/sample.yaml", { applyPlan: "e2e/sample.improve-plan.json" });

    expect(improveTestFile).not.toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("e2e/sample.improved.yaml"),
      expect.stringContaining("name: sample"),
      "utf-8"
    );
    expect(ui.step).toHaveBeenCalledWith(
      expect.stringContaining("Original preserved at:")
    );
    expect(ui.info).toHaveBeenCalledWith(
      expect.stringContaining("skippedAssertions=2")
    );
    expect(ui.warn).toHaveBeenCalledWith(
      "Plan determinism: unsafe (missing baseUrl) — runtime selector apply blocked; recommendations kept report-only"
    );
  });

  it("applies a generated plan in place when requested", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith("sample.improve-plan.json")) {
        return JSON.stringify({
          version: 2,
          generatedAt: new Date().toISOString(),
          testFile: "sample.yaml",
          testFileLocator: "relative_to_plan",
          testFileSha256: hashImprovePlanSource(SAMPLE_YAML),
          sourceReportPath: "sample.improve-report.json",
          sourceReportPathLocator: "relative_to_plan",
          appliedBy: "plan_preview",
          determinism: {
            status: "safe",
            reasons: [],
          },
          profile: {
            assertions: "candidates",
            assertionSource: "snapshot-native",
            assertionPolicy: "balanced",
            applySelectors: true,
            applyAssertions: true,
          },
          summary: {
            runtimeFailingStepsRetained: 0,
            runtimeFailingStepsRemoved: 0,
            skippedAssertions: 0,
          },
          diagnostics: [],
          assertionCandidates: [],
          test: {
            name: "sample",
            steps: [{ action: "navigate", url: "/" }],
          },
        });
      }
      return SAMPLE_YAML;
    });

    await runImprove("e2e/sample.yaml", {
      applyPlan: "e2e/sample.improve-plan.json",
      inPlace: true,
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("e2e/sample.yaml"),
      expect.stringContaining("name: sample"),
      "utf-8"
    );
  });

  it("applies a generated plan to a custom output path", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith("sample.improve-plan.json")) {
        return JSON.stringify({
          version: 2,
          generatedAt: new Date().toISOString(),
          testFile: "sample.yaml",
          testFileLocator: "relative_to_plan",
          testFileSha256: hashImprovePlanSource(SAMPLE_YAML),
          sourceReportPath: "sample.improve-report.json",
          sourceReportPathLocator: "relative_to_plan",
          appliedBy: "plan_preview",
          determinism: {
            status: "safe",
            reasons: [],
          },
          profile: {
            assertions: "candidates",
            assertionSource: "snapshot-native",
            assertionPolicy: "balanced",
            applySelectors: true,
            applyAssertions: true,
          },
          summary: {
            runtimeFailingStepsRetained: 0,
            runtimeFailingStepsRemoved: 0,
            skippedAssertions: 0,
          },
          diagnostics: [],
          assertionCandidates: [],
          test: {
            name: "sample",
            steps: [{ action: "navigate", url: "/" }],
          },
        });
      }
      return SAMPLE_YAML;
    });

    await runImprove("e2e/sample.yaml", {
      applyPlan: "e2e/sample.improve-plan.json",
      output: "custom/out.yaml",
    });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("custom/out.yaml"),
      expect.stringContaining("name: sample"),
      "utf-8"
    );
  });

  it("accepts moved targets when the content fingerprint still matches", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith("sample.improve-plan.json")) {
        return JSON.stringify({
          version: 2,
          generatedAt: new Date().toISOString(),
          testFile: "sample.yaml",
          testFileLocator: "relative_to_plan",
          testFileSha256: hashImprovePlanSource(SAMPLE_YAML),
          sourceReportPath: "sample.improve-report.json",
          sourceReportPathLocator: "relative_to_plan",
          appliedBy: "plan_preview",
          determinism: {
            status: "safe",
            reasons: [],
          },
          profile: {
            assertions: "candidates",
            assertionSource: "snapshot-native",
            assertionPolicy: "balanced",
            applySelectors: true,
            applyAssertions: true,
          },
          summary: {
            runtimeFailingStepsRetained: 0,
            runtimeFailingStepsRemoved: 0,
            skippedAssertions: 0,
          },
          diagnostics: [],
          assertionCandidates: [],
          test: {
            name: "sample",
            steps: [{ action: "navigate", url: "/" }],
          },
        });
      }
      return SAMPLE_YAML;
    });

    await runImprove("e2e/moved-sample.yaml", {
      applyPlan: "e2e/sample.improve-plan.json",
      inPlace: true,
    });

    expect(ui.warn).toHaveBeenCalledWith(
      expect.stringContaining("matched by content fingerprint")
    );
  });

  it("rejects plan apply when the source fingerprint no longer matches", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith("sample.improve-plan.json")) {
        return JSON.stringify({
          version: 2,
          generatedAt: new Date().toISOString(),
          testFile: "sample.yaml",
          testFileLocator: "relative_to_plan",
          testFileSha256: hashImprovePlanSource(SAMPLE_YAML),
          sourceReportPath: "sample.improve-report.json",
          sourceReportPathLocator: "relative_to_plan",
          appliedBy: "plan_preview",
          determinism: {
            status: "safe",
            reasons: [],
          },
          profile: {
            assertions: "candidates",
            assertionSource: "snapshot-native",
            assertionPolicy: "balanced",
            applySelectors: true,
            applyAssertions: true,
          },
          summary: {
            runtimeFailingStepsRetained: 0,
            runtimeFailingStepsRemoved: 0,
            skippedAssertions: 0,
          },
          diagnostics: [],
          assertionCandidates: [],
          test: {
            name: "sample",
            steps: [{ action: "navigate", url: "/" }],
          },
        });
      }
      return "name: changed\nsteps:\n  - action: navigate\n    url: /other\n";
    });

    await expect(
      runImprove("e2e/sample.yaml", { applyPlan: "e2e/sample.improve-plan.json" })
    ).rejects.toThrow(/Plan source mismatch/);
  });

  it("rejects report/profile flags in apply-plan mode", async () => {
    await expect(
      runImprove("e2e/sample.yaml", {
        applyPlan: "e2e/sample.improve-plan.json",
        report: "custom-report.json",
      })
    ).rejects.toThrow(/Cannot combine --apply-plan with apply\/profile\/report flags/);

    await expect(
      runImprove("e2e/sample.yaml", {
        applyPlan: "e2e/sample.improve-plan.json",
        assertions: "none",
      })
    ).rejects.toThrow(/Cannot combine --apply-plan with apply\/profile\/report flags/);
  });
});
