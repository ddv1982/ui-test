import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import type { Step } from "../yaml-schema.js";
import { planAssertionCoverage } from "./assertion-coverage-planner.js";

describe("planAssertionCoverage", () => {
  it("guarantees one required assertion candidate per covered step", () => {
    const steps: Step[] = [
      { action: "navigate", url: "https://example.com" },
      { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
      { action: "check", target: { value: "#agree", kind: "css", source: "manual" } },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 2,
        afterAction: "fill",
        candidate: { action: "assertValue", target: { value: "#name", kind: "css", source: "manual" }, value: "Alice" },
        confidence: 0.9,
        rationale: "fill candidate",
        candidateSource: "deterministic",
      },
      {
        index: 3,
        afterAction: "check",
        candidate: { action: "assertChecked", target: { value: "#agree", kind: "css", source: "manual" }, checked: true },
        confidence: 0.9,
        rationale: "check candidate",
        candidateSource: "deterministic",
      },
    ];

    const planned = planAssertionCoverage(steps, [0, 1, 2, 3], candidates);

    expect(planned.requiredCandidateIndexes).toHaveLength(3);
    expect(planned.fallbackCandidateIndexes).toHaveLength(1);
    const fallback = planned.candidates[planned.fallbackCandidateIndexes[0]!];
    expect(fallback?.index).toBe(1);
    expect(fallback?.candidate.action).toBe("assertVisible");
    if (fallback?.candidate.action === "assertVisible") {
      expect(fallback.candidate.target.value).toBe("#submit");
    }
  });

  it("prefers assertText over assertVisible for click primaries", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#open", kind: "css", source: "manual" } },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 0,
        afterAction: "click",
        candidate: { action: "assertVisible", target: { value: "#panel", kind: "css", source: "manual" } },
        confidence: 0.8,
        rationale: "visible panel",
        candidateSource: "snapshot_native",
      },
      {
        index: 0,
        afterAction: "click",
        candidate: { action: "assertText", target: { value: "#panel", kind: "css", source: "manual" }, text: "Welcome" },
        confidence: 0.8,
        rationale: "panel text",
        candidateSource: "snapshot_native",
      },
    ];

    const planned = planAssertionCoverage(steps, [0], candidates);

    expect(planned.requiredCandidateIndexes).toHaveLength(1);
    const primary = planned.candidates[planned.requiredCandidateIndexes[0]!];
    expect(primary?.candidate.action).toBe("assertText");
  });

  it("uses mapped original step indexes when adding fallback candidates", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#menu", kind: "css", source: "manual" } },
      { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 9,
        afterAction: "fill",
        candidate: { action: "assertValue", target: { value: "#name", kind: "css", source: "manual" }, value: "Alice" },
        confidence: 0.9,
        rationale: "fill candidate",
        candidateSource: "deterministic",
      },
    ];

    const planned = planAssertionCoverage(steps, [8, 9], candidates);
    const fallback = planned.candidates[planned.fallbackCandidateIndexes[0]!];
    expect(fallback?.index).toBe(8);
  });

  it("prefers form assertions targeting the acted element", () => {
    const steps: Step[] = [
      { action: "fill", target: { value: "#email", kind: "css", source: "manual" }, text: "user@example.com" },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 0,
        afterAction: "fill",
        candidate: {
          action: "assertValue",
          target: { value: "#other", kind: "css", source: "manual" },
          value: "user@example.com",
        },
        confidence: 0.9,
        rationale: "same value but wrong target",
        candidateSource: "snapshot_native",
      },
      {
        index: 0,
        afterAction: "fill",
        candidate: {
          action: "assertValue",
          target: { value: "#email", kind: "css", source: "manual" },
          value: "user@example.com",
        },
        confidence: 0.8,
        rationale: "same value and right target",
        candidateSource: "deterministic",
      },
    ];

    const planned = planAssertionCoverage(steps, [0], candidates);
    const primary = planned.candidates[planned.requiredCandidateIndexes[0]!];
    expect(primary?.candidate.action).toBe("assertValue");
    if (primary?.candidate.action === "assertValue") {
      expect(primary.candidate.target.value).toBe("#email");
    }
  });

  it("creates fallback coverage assertion when no click-compatible candidate exists", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 0,
        afterAction: "click",
        candidate: {
          action: "assertValue",
          target: { value: "#toast", kind: "css", source: "manual" },
          value: "Saved",
        },
        confidence: 0.9,
        rationale: "off-target value",
        candidateSource: "snapshot_native",
      },
    ];

    const planned = planAssertionCoverage(steps, [0], candidates);
    expect(planned.requiredCandidateIndexes).toHaveLength(1);
    expect(planned.fallbackCandidateIndexes).toHaveLength(1);

    const primary = planned.candidates[planned.requiredCandidateIndexes[0]!];
    expect(primary?.candidate.action).toBe("assertVisible");
    if (primary?.candidate.action === "assertVisible") {
      expect(primary.candidate.target.value).toBe("#submit");
    }
  });

  it("ignores acted-target assertText for click primaries and falls back", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
    ];
    const candidates: AssertionCandidate[] = [
      {
        index: 0,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#submit", kind: "css", source: "manual" },
          text: "Submit",
        },
        confidence: 0.9,
        rationale: "same-target text",
        candidateSource: "snapshot_native",
      },
    ];

    const planned = planAssertionCoverage(steps, [0], candidates);
    expect(planned.requiredCandidateIndexes).toHaveLength(1);
    expect(planned.fallbackCandidateIndexes).toHaveLength(1);
    const primary = planned.candidates[planned.requiredCandidateIndexes[0]!];
    expect(primary?.candidate.action).toBe("assertVisible");
    if (primary?.candidate.action === "assertVisible") {
      expect(primary.candidate.target.value).toBe("#submit");
    }
  });

  it("covers assertion steps as non-navigate actions", () => {
    const steps: Step[] = [
      { action: "assertVisible", target: { value: "#status", kind: "css", source: "manual" } },
    ];

    const planned = planAssertionCoverage(steps, [0], []);

    expect(planned.requiredCandidateIndexes).toHaveLength(1);
    expect(planned.fallbackCandidateIndexes).toHaveLength(1);
    const fallback = planned.candidates[planned.fallbackCandidateIndexes[0]!];
    expect(fallback?.candidate.action).toBe("assertVisible");
    if (fallback?.candidate.action === "assertVisible") {
      expect(fallback.candidate.target.value).toBe("#status");
    }
  });
});
