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
          rationale: "Policy-capped state check",
          candidateSource: "snapshot_native",
          applyStatus: "skipped_policy",
          applyMessage: "Skipped by policy",
        },
      ],
      diagnostics: [],
    });

    expect(parsed.summary.appliedAssertions).toBe(1);
    expect(parsed.summary.assertionApplyStatusCounts?.applied).toBe(1);
    expect(parsed.summary.assertionCandidateSourceCounts?.snapshot_native).toBe(1);
    expect(parsed.assertionCandidates[0]?.candidateSource).toBe("deterministic");
    expect(parsed.assertionCandidates[0]?.applyStatus).toBe("applied");
    expect(parsed.assertionCandidates[1]?.candidateSource).toBe("snapshot_native");
    expect(parsed.assertionCandidates[1]?.applyStatus).toBe("skipped_policy");
  });
});
