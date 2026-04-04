import { describe, expect, it } from "vitest";
import {
  appendDeterminismDiagnostics,
  appendDeterminismSuppressionDiagnostic,
  applyDeterminismGuardToSelectorPass,
  applyFailedStepRemovals,
  buildTestDocument,
  buildYamlOptionsFromTest,
  resolveImproveDeterminismCapabilities,
  resolveImproveExecutionPlan,
  resolveRuntimeFailingSteps,
} from "./improve-runner-support.js";

describe("improve-runner-support", () => {
  it("builds execution plans for deterministic review without browser", () => {
    expect(
      resolveImproveExecutionPlan({
        applySelectors: false,
        applyAssertions: false,
        assertions: "candidates",
        assertionSource: "deterministic",
      })
    ).toEqual({
      needsBrowser: false,
      wantsNativeSnapshots: false,
    });
  });

  it("builds execution plans for snapshot-native analysis with browser", () => {
    expect(
      resolveImproveExecutionPlan({
        applySelectors: false,
        applyAssertions: false,
        assertions: "candidates",
        assertionSource: "snapshot-native",
      })
    ).toEqual({
      needsBrowser: true,
      wantsNativeSnapshots: true,
    });
  });

  it("classifies runtime-failing steps and skips navigate removals", () => {
    const diagnostics: Array<{ code: string; level: "info" | "warn" | "error"; message: string }> =
      [];

    const result = resolveRuntimeFailingSteps({
      wantsWrite: true,
      allowRuntimeDerivedApply: true,
      failedStepIndexes: [0, 1, 2],
      outputSteps: [
        { action: "navigate", url: "/" },
        {
          action: "click",
          target: { value: "#cookie-accept", kind: "css", source: "manual" },
        },
        {
          action: "click",
          target: { value: "#purchase", kind: "css", source: "manual" },
        },
      ],
      outputStepOriginalIndexes: [0, 1, 2],
      diagnostics,
      appliedBy: "manual_apply",
    });

    expect([...result.failedIndexesToRemove]).toEqual([1]);
    expect([...result.failedIndexesToRetain]).toEqual([2]);
    expect(diagnostics.map((item) => item.code)).toEqual([
      "runtime_failing_step_removed",
      "runtime_failing_step_retained",
    ]);
  });

  it("suppresses runtime-failing removals when determinism guard is unsafe", () => {
    const diagnostics: Array<{ code: string; level: "info" | "warn" | "error"; message: string }> =
      [];

    const result = resolveRuntimeFailingSteps({
      wantsWrite: true,
      allowRuntimeDerivedApply: false,
      failedStepIndexes: [0],
      outputSteps: [
        {
          action: "click",
          target: { value: "#cookie-accept", kind: "css", source: "manual" },
        },
      ],
      outputStepOriginalIndexes: [0],
      diagnostics,
      appliedBy: "manual_apply",
    });

    expect([...result.failedIndexesToRemove]).toEqual([]);
    expect([...result.failedIndexesToRetain]).toEqual([0]);
    expect(diagnostics.map((item) => item.code)).toEqual([
      "runtime_failing_step_removal_suppressed_by_determinism",
    ]);
  });

  it("removes failed steps and remaps snapshots/findings", () => {
    const result = applyFailedStepRemovals({
      wantsWrite: true,
      failedIndexesToRemove: new Set([1]),
      outputSteps: [
        { action: "navigate", url: "/" },
        {
          action: "click",
          target: { value: "#cookie-accept", kind: "css", source: "manual" },
        },
        {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
      ],
      outputStepOriginalIndexes: [0, 1, 2],
      nativeStepSnapshots: [
        {
          index: 1,
          step: {
            action: "click",
            target: { value: "#cookie-accept", kind: "css", source: "manual" },
          },
          preSnapshot: "before",
          postSnapshot: "after",
        },
        {
          index: 2,
          step: {
            action: "click",
            target: { value: "#submit", kind: "css", source: "manual" },
          },
          preSnapshot: "before-submit",
          postSnapshot: "after-submit",
        },
      ],
      findings: [
        {
          index: 1,
          action: "click",
          changed: false,
          oldTarget: { value: "#cookie-accept", kind: "css", source: "manual" },
          recommendedTarget: { value: "#cookie-accept", kind: "css", source: "manual" },
          oldScore: 0.5,
          recommendedScore: 0.5,
          confidenceDelta: 0,
          reasonCodes: [],
        },
        {
          index: 2,
          action: "click",
          changed: false,
          oldTarget: { value: "#submit", kind: "css", source: "manual" },
          recommendedTarget: { value: "#submit", kind: "css", source: "manual" },
          oldScore: 0.5,
          recommendedScore: 0.5,
          confidenceDelta: 0,
          reasonCodes: [],
        },
      ],
    });

    expect(result.outputSteps).toHaveLength(2);
    expect(result.outputStepOriginalIndexes).toEqual([0, 2]);
    expect(result.nativeStepSnapshots).toHaveLength(1);
    expect(result.nativeStepSnapshots[0]?.index).toBe(1);
    expect(result.findings.map((finding) => finding.index)).toEqual([2]);
  });

  it("builds test documents and yaml options without leaking undefined fields", () => {
    expect(
      buildTestDocument(
        { name: "sample", description: "desc", baseUrl: "https://example.com" },
        [{ action: "navigate", url: "/" }]
      )
    ).toEqual({
      name: "sample",
      description: "desc",
      baseUrl: "https://example.com",
      steps: [{ action: "navigate", url: "/" }],
    });

    expect(buildYamlOptionsFromTest({})).toEqual({});
    expect(
      buildYamlOptionsFromTest({ description: "desc", baseUrl: "https://example.com" })
    ).toEqual({
      description: "desc",
      baseUrl: "https://example.com",
    });
  });

  it("marks missing baseUrl as unsafe for runtime-derived apply", () => {
    expect(
      resolveImproveDeterminismCapabilities({
        steps: [{ action: "navigate", url: "https://example.com" }],
      })
    ).toMatchObject({
      allowRuntimeDerivedApply: false,
      allowRuntimeSelectorRepairApply: false,
      allowRuntimeAssertionApply: false,
      emitDeterminismDiagnostics: true,
      determinism: {
        status: "unsafe",
        reasons: ["missing_base_url"],
      },
    });
  });

  it("marks cross-origin drift as unsafe when replay leaves the base origin", () => {
    expect(
      resolveImproveDeterminismCapabilities({
        baseUrl: "https://example.com/app",
        steps: [{ action: "navigate", url: "/" }],
        observedUrls: ["https://example.com/app", "https://news.example.net/story"],
      })
    ).toMatchObject({
      allowRuntimeDerivedApply: false,
      determinism: {
        status: "unsafe",
        reasons: ["cross_origin_drift"],
        baseOrigin: "https://example.com",
        observedOrigins: ["https://example.com", "https://news.example.net"],
      },
    });
  });

  it("reverts runtime-derived selector applications under determinism guard", () => {
    const diagnostics = [
      {
        code: "selector_repair_applied",
        level: "info" as const,
        message: "Step 2: applied selector repair candidate (locator_repair_playwright_runtime).",
      },
      {
        code: "selector_repair_adopted_on_tie_for_dynamic_target",
        level: "info" as const,
        message: "Step 2: adopted dynamic selector repair candidate on score tie.",
      },
    ];

    const result = applyDeterminismGuardToSelectorPass({
      selectorPass: {
        outputSteps: [
          { action: "navigate", url: "/" },
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
        selectorRepairsApplied: 1,
        selectorRepairsAdoptedOnTie: 1,
        selectorRepairsAppliedFromPlaywrightRuntime: 1,
      },
      initialOutputSteps: [
        { action: "navigate", url: "/" },
        {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
      ],
      outputStepOriginalIndexes: [0, 1],
      diagnostics,
      appliedBy: "manual_apply",
    });

    expect(result.outputSteps[1]).toMatchObject({
      action: "click",
      target: { value: "#submit", kind: "css", source: "manual" },
    });
    expect(result.selectorRepairsApplied).toBe(0);
    expect(result.selectorRepairsAdoptedOnTie).toBe(0);
    expect(result.selectorRepairsAppliedFromPlaywrightRuntime).toBe(0);
    expect(result.suppressedRuntimeSelectorRepairs).toBe(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "selector_repair_apply_suppressed_by_determinism",
    ]);
  });

  it("appends determinism reason and suppression diagnostics", () => {
    const diagnostics: Array<{ code: string; level: "info" | "warn" | "error"; message: string }> =
      [];

    appendDeterminismDiagnostics({
      diagnostics,
      determinism: {
        status: "unsafe",
        reasons: ["missing_base_url", "cross_origin_drift"],
      },
      appliedBy: "report_only",
    });
    appendDeterminismSuppressionDiagnostic({
      diagnostics,
      mutationType: "assertion_insert",
      appliedBy: "report_only",
    });

    expect(diagnostics.map((item) => item.code)).toEqual([
      "determinism_missing_base_url",
      "determinism_cross_origin_drift",
      "determinism_assertion_insert_suppressed",
    ]);
  });
});
