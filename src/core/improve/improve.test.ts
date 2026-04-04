import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserError, ValidationError } from "../../utils/errors.js";

const { chromiumLaunchMock, runImproveSelectorPassMock, runImproveAssertionPassMock } = vi.hoisted(
  () => ({
    chromiumLaunchMock: vi.fn(),
    runImproveSelectorPassMock: vi.fn(),
    runImproveAssertionPassMock: vi.fn(),
  })
);

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}));

vi.mock("./improve-selector-pass.js", () => ({
  runImproveSelectorPass: runImproveSelectorPassMock,
}));

vi.mock("./improve-assertion-pass.js", () => ({
  runImproveAssertionPass: runImproveAssertionPassMock,
}));

import { improveTestFile } from "./improve.js";

function createBrowserMock() {
  return {
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => ({})),
      addInitScript: vi.fn(async () => {}),
    })),
    close: vi.fn(async () => {}),
  };
}

describe("improveTestFile runner", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetAllMocks();

    chromiumLaunchMock.mockResolvedValue(createBrowserMock());
    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [],
      runtimeObservedUrls: [],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
    }));
    runImproveAssertionPassMock.mockImplementation(async (input) => ({
      outputSteps: input.outputSteps,
      assertionCandidates: [],
      appliedAssertions: 0,
      skippedAssertions: 0,
      filteredDynamicCandidates: 0,
    }));
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function writeSampleYaml(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );
    return yamlPath;
  }

  async function writeYamlWithOptionalStep(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "legacy-optional.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: legacy optional",
        "steps:",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
        "    optional: true",
      ].join("\n") + "\n",
      "utf-8"
    );
    return yamlPath;
  }

  async function writeYamlWithTransientStep(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "transient.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: transient",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: navigate",
        '    url: "/"',
        "  - action: click",
        "    target:",
        '      value: "#cookie-accept"',
        "      kind: css",
        "      source: manual",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );
    return yamlPath;
  }

  async function writeYamlWithBaseUrl(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "base-url.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: base-url",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: navigate",
        '    url: "/"',
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );
    return yamlPath;
  }

  async function writeYamlWithOnlyTransientStep(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "transient-only.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: transient-only",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: click",
        "    target:",
        '      value: "#cookie-accept"',
        "      kind: css",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );
    return yamlPath;
  }

  it("does not require chromium for deterministic review mode", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "deterministic",
    });

    expect(result.reportPath).toBe(path.join(path.dirname(yamlPath), "sample.improve-report.json"));
    expect(chromiumLaunchMock).not.toHaveBeenCalled();
    const selectorPassArgs = runImproveSelectorPassMock.mock.calls[0]?.[0];
    expect(selectorPassArgs).toMatchObject({
      wantsNativeSnapshots: false,
    });
    expect(selectorPassArgs).not.toHaveProperty("page");
  });

  it("fails in review mode when snapshot-native analysis requires chromium", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
  });

  it("fails fast when optional is present in YAML steps", async () => {
    const yamlPath = await writeYamlWithOptionalStep();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    await expect(run).rejects.toBeInstanceOf(ValidationError);
    await expect(run).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.stringContaining(
          "steps.0.optional: `optional` is no longer supported. Remove this field from the step."
        ),
      ]),
    });
    expect(chromiumLaunchMock).not.toHaveBeenCalled();
  });

  it("fails in apply mode with explicit remediation hint", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup"),
    });
  });

  it("writes default report with playwright provider", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.reportPath).toBe(path.join(path.dirname(yamlPath), "sample.improve-report.json"));
    expect(result.report.providerUsed).toBe("playwright");
    expect(result.outputPath).toBeUndefined();

    const savedReport = JSON.parse(await fs.readFile(result.reportPath, "utf-8")) as {
      providerUsed: string;
    };
    expect(savedReport.providerUsed).toBe("playwright");
  });

  it("removes runtime-failing steps in apply mode", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(
      result.report.diagnostics.some((d) => d.code === "runtime_failing_step_removed")
    ).toBe(true);

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).not.toContain("cookie-accept");
    expect(written).toContain("submit");
  });

  it("writes apply output to outputPath when provided and preserves the original", async () => {
    const yamlPath = await writeYamlWithTransientStep();
    const improvedPath = path.join(path.dirname(yamlPath), "transient.improved.yaml");

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      outputPath: improvedPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.outputPath).toBe(path.resolve(improvedPath));

    const original = await fs.readFile(yamlPath, "utf-8");
    expect(original).toContain("cookie-accept");

    const improved = await fs.readFile(improvedPath, "utf-8");
    expect(improved).not.toContain("cookie-accept");
    expect(improved).toContain("submit");
  });

  it("blocks YAML write when apply output would fail schema validation", async () => {
    const yamlPath = await writeYamlWithOnlyTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [0],
      runtimeObservedUrls: [],
    }));

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    await expect(run).rejects.toBeInstanceOf(ValidationError);
    await expect(run).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.stringContaining("steps: Test must have at least one step"),
      ]),
    });

    const unchangedYaml = await fs.readFile(yamlPath, "utf-8");
    expect(unchangedYaml).toContain("cookie-accept");

    const reportPath = path.join(path.dirname(yamlPath), "transient-only.improve-report.json");
    const report = JSON.parse(await fs.readFile(reportPath, "utf-8")) as {
      diagnostics: Array<{ code: string }>;
    };
    expect(
      report.diagnostics.some((diagnostic) => diagnostic.code === "apply_write_blocked_invalid_output")
    ).toBe(true);
  });

  it("does not remove navigate steps even if they fail", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [0, 1],
      runtimeObservedUrls: [],
    }));

    await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("navigate");
    // The cookie-accept click step should be removed, but navigate should remain
    expect(written).not.toContain("cookie-accept");
    expect(written).toContain("submit");
  });

  it("passes reduced arrays to assertion pass when steps are removed", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [
        { index: 0, step: {} as any, preSnapshot: "a", postSnapshot: "a" },
        { index: 1, step: {} as any, preSnapshot: "b", postSnapshot: "b" },
        { index: 2, step: {} as any, preSnapshot: "c", postSnapshot: "c" },
      ],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
    }));

    await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    const assertionCallArgs = runImproveAssertionPassMock.mock.calls[0][0];
    // Step at index 1 removed → 2 steps remain
    expect(assertionCallArgs.outputSteps).toHaveLength(2);
    expect(assertionCallArgs.outputStepOriginalIndexes).toHaveLength(2);
    // Snapshot for removed step filtered out, remaining index remapped
    expect(assertionCallArgs.nativeStepSnapshots).toHaveLength(2);
    expect(assertionCallArgs.nativeStepSnapshots[0].index).toBe(0);
    expect(assertionCallArgs.nativeStepSnapshots[1].index).toBe(1);
  });

  it("does not remove steps in report-only mode", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.outputPath).toBeUndefined();
    expect(
      result.report.diagnostics.some((d) => d.code === "runtime_failing_step_removed")
    ).toBe(false);

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("cookie-accept");
  });

  it("downgrades applyAssertions when assertions mode is none", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "none",
    });

    expect(runImproveAssertionPassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyAssertions: false,
        assertions: "none",
      })
    );
    expect(
      result.report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "apply_assertions_disabled_by_assertions_none" &&
          diagnostic.level === "warn"
      )
    ).toBe(true);
  });

  it("retains non-transient runtime-failing steps and removes transient ones", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1, 2],
      runtimeObservedUrls: [],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).not.toContain("cookie-accept");
    expect(written).toContain("submit");
    expect(written).not.toContain("optional:");
    expect(result.report.summary.runtimeFailingStepsRetained).toBe(1);
    expect(
      result.report.diagnostics.some((diagnostic) => diagnostic.code === "runtime_failing_step_retained")
    ).toBe(true);
  });

  it("keeps likely business-intent transient-context failures as retained", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "transient-privacy.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: transient-privacy",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: navigate",
        '    url: "/"',
        "  - action: click",
        "    target:",
        '      value: "getByRole(\'button\', { name: \'Accept payment privacy settings\' })"',
        "      kind: locatorExpression",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("Accept payment privacy settings");
    expect(written).not.toContain("optional:");
    expect(written).toContain("navigate");
    expect(result.report.summary.runtimeFailingStepsRetained).toBe(1);
  });

  it("retains low-confidence transient removals behind safety guard", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "transient-soft.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: transient-soft",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: navigate",
        '    url: "/"',
        "  - action: click",
        "    target:",
        '      value: "getByRole(\'button\', { name: \'Close privacy notice\' })"',
        "      kind: locatorExpression",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: [],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("Close privacy notice");
    expect(result.report.summary.runtimeFailingStepsRetained).toBe(1);
    expect(
      result.report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "runtime_failing_step_retained" &&
          diagnostic.mutationSafety === "unsafe_to_auto_apply"
      )
    ).toBe(true);
  });

  it("suppresses runtime-derived apply without a baseUrl and keeps recommendations report-only", async () => {
    const yamlPath = await writeSampleYaml();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: [
        input.steps[0],
        {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Save' })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      findings: [
        {
          index: 1,
          action: "click",
          changed: true,
          oldTarget: { value: "#submit", kind: "css", source: "manual" },
          recommendedTarget: {
            value: "getByRole('button', { name: 'Save' })",
            kind: "locatorExpression",
            source: "manual",
          },
          oldScore: 0.2,
          recommendedScore: 0.9,
          confidenceDelta: 0.7,
          reasonCodes: ["locator_repair_playwright_runtime"],
        },
      ],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
      runtimeObservedUrls: ["https://example.com/"],
      selectorRepairCandidates: 1,
      selectorRepairsApplied: 1,
      selectorRepairsAdoptedOnTie: 0,
      selectorRepairsGeneratedByPlaywrightRuntime: 1,
      selectorRepairsAppliedFromPlaywrightRuntime: 1,
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.report.determinism).toMatchObject({
      status: "unsafe",
      reasons: ["missing_base_url"],
      suppressedMutationTypes: ["selector_update", "runtime_step_removal"],
    });
    expect(result.report.summary.selectorRepairsApplied).toBe(0);
    expect(result.report.summary.selectorRepairsAppliedFromPlaywrightRuntime).toBe(0);
    expect(result.report.summary.runtimeFailingStepsRemoved).toBe(0);
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "selector_repair_apply_suppressed_by_determinism"
      )
    ).toBe(true);
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "determinism_missing_base_url"
      )
    ).toBe(true);

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain('value: "#submit"');
    expect(written).not.toContain("getByRole('button', { name: 'Save' })");
  });

  it("passes runtime assertion gating through for cross-origin drift and preserves safe local flows", async () => {
    const unsafeYamlPath = await writeYamlWithBaseUrl();

    runImproveSelectorPassMock.mockImplementationOnce(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [],
      runtimeObservedUrls: ["https://example.com/app", "https://news.example.net/story"],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
      selectorRepairsAdoptedOnTie: 0,
      selectorRepairsGeneratedByPlaywrightRuntime: 0,
      selectorRepairsAppliedFromPlaywrightRuntime: 0,
    }));

    await improveTestFile({
      testFile: unsafeYamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
    });

    expect(runImproveAssertionPassMock.mock.calls[0]?.[0]).toMatchObject({
      allowRuntimeAssertionApply: false,
    });

    const safeYamlPath = await writeYamlWithBaseUrl();
    runImproveSelectorPassMock.mockImplementationOnce(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [],
      runtimeObservedUrls: ["https://example.com/app"],
      selectorRepairCandidates: 0,
      selectorRepairsApplied: 0,
      selectorRepairsAdoptedOnTie: 0,
      selectorRepairsGeneratedByPlaywrightRuntime: 0,
      selectorRepairsAppliedFromPlaywrightRuntime: 0,
    }));

    const safeResult = await improveTestFile({
      testFile: safeYamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
    });

    expect(runImproveAssertionPassMock.mock.calls[1]?.[0]).toMatchObject({
      allowRuntimeAssertionApply: true,
    });
    expect(safeResult.report.determinism.status).toBe("safe");
  });
});
