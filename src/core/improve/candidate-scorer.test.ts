import { describe, expect, it } from "vitest";
import type { TargetCandidate } from "./candidate-generator.js";
import { scoreTargetCandidates, shouldAdoptCandidate } from "./candidate-scorer.js";

function candidate(
  partial: Partial<TargetCandidate> & Pick<TargetCandidate, "target">
): TargetCandidate {
  return {
    id: "c1",
    source: "current",
    reasonCodes: ["existing_target"],
    ...partial,
  };
}

describe("candidate-scorer", () => {
  it("scores without runtime when page is unavailable", async () => {
    const scored = await scoreTargetCandidates(undefined, [
      candidate({
        id: "css",
        target: { value: "#submit", kind: "css", source: "manual" },
      }),
      candidate({
        id: "locator",
        target: {
          value: "getByRole('button', { name: 'Submit' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }),
    ]);

    expect(scored[0]?.candidate.id).toBe("locator");
    expect(scored[0]?.runtimeChecked).toBe(false);
    expect(scored[0]?.reasonCodes).toContain("runtime_unavailable");
    expect(scored[1]?.candidate.id).toBe("css");
  });

  it("applies dynamic penalty to current dynamic targets", async () => {
    const scored = await scoreTargetCandidates(undefined, [
      candidate({
        id: "dynamic",
        target: {
          value: "getByRole('link', { name: 'Winterweer liveblog', exact: true })",
          kind: "locatorExpression",
          source: "manual",
        },
        dynamicSignals: ["exact_true", "contains_weather_or_news_fragment"],
      }),
      candidate({
        id: "stable",
        target: {
          value: "getByRole('button', { name: 'Submit' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }),
    ]);

    expect(scored[0]?.candidate.id).toBe("stable");
    expect(scored[1]?.reasonCodes).toContain("dynamic_target");
  });

  it("uses locator confidence to rank named/label-based locators over generic textbox roles", async () => {
    const scored = await scoreTargetCandidates(undefined, [
      candidate({
        id: "generic-textbox",
        target: {
          value: "getByRole('textbox')",
          kind: "locatorExpression",
          source: "manual",
        },
      }),
      candidate({
        id: "label",
        source: "derived",
        target: {
          value: "getByLabel('Email')",
          kind: "locatorExpression",
          source: "manual",
        },
      }),
    ]);

    expect(scored[0]?.candidate.id).toBe("label");
    expect(scored[0]?.baseScore).toBe(0.8);
    expect(scored[1]?.baseScore).toBe(0.55);
  });

  it("only adopts candidates when threshold is met", () => {
    const current = {
      candidate: candidate({
        id: "current",
        target: { value: "#submit", kind: "css", source: "manual" },
      }),
      score: 0.5,
      baseScore: 0.5,
      uniquenessScore: 0,
      visibilityScore: 0,
      runtimeChecked: false,
      reasonCodes: [],
    };
    const suggested = {
      candidate: candidate({
        id: "suggested",
        source: "derived",
        target: {
          value: "getByRole('button', { name: 'Submit' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }),
      score: 0.66,
      baseScore: 0.66,
      uniquenessScore: 0,
      visibilityScore: 0,
      runtimeChecked: false,
      reasonCodes: [],
    };

    expect(shouldAdoptCandidate(current, suggested)).toBe(true);
    expect(shouldAdoptCandidate(current, { ...suggested, score: 0.6 })).toBe(false);
    expect(shouldAdoptCandidate(current, { ...suggested, candidate: current.candidate })).toBe(false);
  });
});
