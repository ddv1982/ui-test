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
        assertionApplyPolicy: "reliable",
        assertionApplyStatusCounts: {
          applied: 1,
          skipped_policy: 1,
        },
        assertionCandidateSourceCounts: {
          deterministic: 1,
          snapshot_cli: 1,
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
          candidateSource: "snapshot_cli",
          applyStatus: "skipped_policy",
          applyMessage: "Skipped by policy",
        },
      ],
      diagnostics: [],
    });

    expect(parsed.summary.appliedAssertions).toBe(1);
    expect(parsed.summary.assertionApplyPolicy).toBe("reliable");
    expect(parsed.summary.assertionApplyStatusCounts?.applied).toBe(1);
    expect(parsed.summary.assertionCandidateSourceCounts?.snapshot_cli).toBe(1);
    expect(parsed.assertionCandidates[0]?.candidateSource).toBe("deterministic");
    expect(parsed.assertionCandidates[0]?.applyStatus).toBe("applied");
    expect(parsed.assertionCandidates[1]?.candidateSource).toBe("snapshot_cli");
    expect(parsed.assertionCandidates[1]?.applyStatus).toBe("skipped_policy");
  });
});
