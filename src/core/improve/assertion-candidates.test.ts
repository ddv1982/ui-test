import { describe, expect, it } from "vitest";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import type { StepFinding } from "./report-schema.js";

describe("buildAssertionCandidates", () => {
  it("creates value and checked assertion candidates", () => {
    const findings: StepFinding[] = [
      {
        index: 0,
        action: "fill",
        changed: false,
        oldTarget: { value: "#name", kind: "css", source: "manual" },
        recommendedTarget: { value: "#name", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 1,
        action: "check",
        changed: false,
        oldTarget: { value: "#agree", kind: "css", source: "manual" },
        recommendedTarget: { value: "#agree", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
        { action: "check", target: { value: "#agree", kind: "css", source: "manual" } },
      ],
      findings
    );

    expect(out).toHaveLength(2);
    expect(out[0]?.candidate.action).toBe("assertValue");
    expect(out[1]?.candidate.action).toBe("assertChecked");
  });

  it("does not auto-generate click or press visibility assertions", () => {
    const findings: StepFinding[] = [
      {
        index: 0,
        action: "click",
        changed: false,
        oldTarget: { value: "#login", kind: "css", source: "manual" },
        recommendedTarget: { value: "#login", kind: "css", source: "manual" },
        oldScore: 1,
        recommendedScore: 1,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 1,
        action: "press",
        changed: false,
        oldTarget: { value: "#login", kind: "css", source: "manual" },
        recommendedTarget: { value: "#login", kind: "css", source: "manual" },
        oldScore: 1,
        recommendedScore: 1,
        confidenceDelta: 0,
        reasonCodes: [],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
        { action: "press", target: { value: "#login", kind: "css", source: "manual" }, key: "Enter" },
      ],
      findings
    );

    expect(out).toHaveLength(0);
  });

  it("uses original step indexes mapping when provided", () => {
    const findings: StepFinding[] = [
      {
        index: 2,
        action: "fill",
        changed: true,
        oldTarget: { value: "#name", kind: "css", source: "manual" },
        recommendedTarget: { value: "getByRole('textbox', { name: 'Name' })", kind: "locatorExpression", source: "manual" },
        oldScore: 0.4,
        recommendedScore: 0.95,
        confidenceDelta: 0.55,
        reasonCodes: ["unique_match"],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "click", target: { value: "#menu", kind: "css", source: "manual" } },
        { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
      ],
      findings,
      [1, 2]
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.index).toBe(2);
    expect(out[0]?.candidate.action).toBe("assertValue");
    expect(out[0]?.candidate.target.value).toBe("getByRole('textbox', { name: 'Name' })");
  });
});
