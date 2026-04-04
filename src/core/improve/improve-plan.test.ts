import { describe, expect, it } from "vitest";
import {
  defaultImprovePlanPath,
  hashImprovePlanSource,
  improvePlanSchema,
  relativizePlanPath,
  resolvePlanPath,
  sortPlanAssertionCandidates,
  sortPlanDiagnostics,
} from "./improve-plan.js";

describe("improvePlan", () => {
  it("builds a deterministic default plan path", () => {
    expect(defaultImprovePlanPath("e2e/login.yaml")).toMatch(/e2e\/login\.improve-plan\.json$/);
    expect(defaultImprovePlanPath("e2e/login")).toMatch(/e2e\/login\.improve-plan\.json$/);
  });

  it("accepts version 2 portable plan payloads", () => {
    const parsed = improvePlanSchema.parse({
      version: 2,
      generatedAt: new Date().toISOString(),
      testFile: "../tests/sample.yaml",
      testFileLocator: "relative_to_plan",
      testFileSha256: hashImprovePlanSource("name: sample\nsteps:\n  - action: navigate\n    url: /\n"),
      sourceReportPath: "../tests/sample.improve-report.json",
      sourceReportPathLocator: "relative_to_plan",
      appliedBy: "plan_preview",
      profile: {
        assertions: "candidates",
        assertionSource: "snapshot-native",
        assertionPolicy: "balanced",
        applySelectors: true,
        applyAssertions: true,
      },
      determinism: {
        status: "unsafe",
        reasons: ["missing_base_url"],
        suppressedMutationTypes: ["selector_update"],
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
        steps: [
          {
            action: "navigate",
            url: "/",
          },
        ],
      },
    });

    expect(parsed.version).toBe(2);
    expect(parsed.profile.assertionPolicy).toBe("balanced");
    if (parsed.version !== 2) {
      throw new Error("Expected version 2 plan payload");
    }
    expect(parsed.summary.skippedAssertions).toBe(2);
    expect(parsed.determinism.status).toBe("unsafe");
  });

  it("keeps backward compatibility with version 2 plans that predate determinism metadata", () => {
    const parsed = improvePlanSchema.parse({
      version: 2,
      generatedAt: new Date().toISOString(),
      testFile: "../tests/sample.yaml",
      testFileLocator: "relative_to_plan",
      testFileSha256: hashImprovePlanSource("name: sample\nsteps:\n  - action: navigate\n    url: /\n"),
      sourceReportPath: "../tests/sample.improve-report.json",
      sourceReportPathLocator: "relative_to_plan",
      appliedBy: "plan_preview",
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
      diagnostics: [],
      assertionCandidates: [],
      test: {
        name: "sample",
        steps: [{ action: "navigate", url: "/" }],
      },
    });

    expect(parsed.version).toBe(2);
    if (parsed.version !== 2) {
      throw new Error("Expected version 2 plan payload");
    }
    expect(parsed.determinism).toBeUndefined();
  });

  it("keeps backward compatibility with version 1 plans", () => {
    const parsed = improvePlanSchema.parse({
      version: 1,
      generatedAt: new Date().toISOString(),
      testFile: "/tmp/sample.yaml",
      sourceReportPath: "/tmp/sample.improve-report.json",
      appliedBy: "plan_preview",
      profile: {
        assertions: "candidates",
        assertionSource: "snapshot-native",
        assertionPolicy: "balanced",
        applySelectors: true,
        applyAssertions: true,
      },
      test: {
        name: "sample",
        steps: [
          {
            action: "navigate",
            url: "/",
          },
        ],
      },
    });

    expect(parsed.version).toBe(1);
  });

  it("relativizes and resolves portable plan paths", () => {
    const planPath = "/tmp/plans/sample.improve-plan.json";
    const targetPath = "/tmp/e2e/sample.yaml";
    const relativeTargetPath = relativizePlanPath(planPath, targetPath);

    expect(relativeTargetPath).toBe("../e2e/sample.yaml");
    expect(resolvePlanPath(planPath, relativeTargetPath, "relative_to_plan")).toBe(targetPath);
  });

  it("sorts diagnostics deterministically", () => {
    const out = sortPlanDiagnostics([
      { code: "b", level: "warn", message: "z" },
      { code: "a", level: "warn", message: "z" },
      { code: "a", level: "info", message: "m" },
    ]);

    expect(out).toEqual([
      { code: "a", level: "info", message: "m" },
      { code: "a", level: "warn", message: "z" },
      { code: "b", level: "warn", message: "z" },
    ]);
  });

  it("sorts assertion candidates deterministically", () => {
    const out = sortPlanAssertionCandidates([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#b", kind: "css", source: "manual" },
        },
        confidence: 0.76,
        rationale: "later",
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
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#a", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.8,
        rationale: "earlier action",
      },
    ]);

    expect(out.map((candidate) => candidate.candidate.action)).toEqual([
      "assertValue",
      "assertText",
      "assertVisible",
    ]);
  });
});
