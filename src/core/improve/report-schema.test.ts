import { describe, expect, it } from "vitest";
import { improveReportSchema } from "./report-schema.js";

describe("improveReportSchema", () => {
  it("accepts assertion apply summary and candidate status fields", () => {
    const parsed = improveReportSchema.parse({
      testFile: "/tmp/sample.yaml",
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      summary: {
        unchanged: 1,
        improved: 1,
        fallback: 0,
        warnings: 1,
        assertionCandidates: 2,
        appliedAssertions: 1,
        skippedAssertions: 1,
        selectorRepairCandidates: 3,
        selectorRepairsApplied: 1,
        runtimeFailingStepsRetained: 2,
        runtimeFailingStepsOptionalized: 2,
        runtimeFailingStepsRemoved: 1,
        assertionCandidatesFilteredVolatile: 1,
        assertionApplyPolicy: "balanced",
        assertionApplyStatusCounts: {
          applied: 1,
          skipped_policy: 1,
        },
        assertionCandidateSourceCounts: {
          deterministic: 1,
          snapshot_native: 1,
        },
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
          confidence: 0.9,
          stabilityScore: 0.91,
          volatilityFlags: [],
          rationale: "High confidence state check",
          candidateSource: "deterministic",
          applyStatus: "applied",
        },
        {
          index: 2,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#toast", kind: "css", source: "manual" },
          },
          confidence: 0.5,
          stabilityScore: 0.32,
          volatilityFlags: ["contains_numeric_fragment"],
          rationale: "Policy-capped state check",
          candidateSource: "snapshot_native",
          applyStatus: "skipped_policy",
          applyMessage: "Skipped by policy",
        },
      ],
      diagnostics: [],
    });

    expect(parsed.summary.appliedAssertions).toBe(1);
    expect(parsed.summary.assertionApplyPolicy).toBe("balanced");
    expect(parsed.summary.selectorRepairCandidates).toBe(3);
    expect(parsed.summary.runtimeFailingStepsRetained).toBe(2);
    expect(parsed.summary.runtimeFailingStepsOptionalized).toBe(2);
    expect(parsed.summary.assertionCandidatesFilteredVolatile).toBe(1);
    expect(parsed.summary.assertionApplyStatusCounts?.applied).toBe(1);
    expect(parsed.summary.assertionCandidateSourceCounts?.snapshot_native).toBe(1);
    expect(parsed.assertionCandidates[0]?.candidateSource).toBe("deterministic");
    expect(parsed.assertionCandidates[0]?.applyStatus).toBe("applied");
    expect(parsed.assertionCandidates[1]?.candidateSource).toBe("snapshot_native");
    expect(parsed.assertionCandidates[1]?.applyStatus).toBe("skipped_policy");
  });

  it("accepts legacy summary reports that only include runtimeFailingStepsOptionalized", () => {
    const parsed = improveReportSchema.parse({
      testFile: "/tmp/sample.yaml",
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      summary: {
        unchanged: 0,
        improved: 0,
        fallback: 0,
        warnings: 0,
        assertionCandidates: 0,
        appliedAssertions: 0,
        skippedAssertions: 0,
        runtimeFailingStepsOptionalized: 1,
      },
      stepFindings: [],
      assertionCandidates: [],
      diagnostics: [],
    });

    expect(parsed.summary.runtimeFailingStepsOptionalized).toBe(1);
    expect(parsed.summary.runtimeFailingStepsRetained).toBeUndefined();
  });
});
