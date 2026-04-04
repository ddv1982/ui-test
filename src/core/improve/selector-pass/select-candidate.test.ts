import { describe, expect, it } from "vitest";
import type { Step, Target } from "../../yaml-schema.js";
import type { TargetCandidateScore } from "../candidate-scorer.js";
import {
  HIGH_CONFIDENCE_AUTO_APPLY_THRESHOLD,
  selectBestCandidateForStep,
} from "./select-candidate.js";

function target(value: string): Target {
  return {
    value,
    kind: "locatorExpression",
    source: "manual",
    framePath: ['iframe[name="app-frame"]'],
  };
}

function score(input: {
  id: string;
  target: Target;
  score: number;
  matchCount?: number;
  source?: "current" | "derived";
  reasonCodes?: string[];
}): TargetCandidateScore {
  return {
    candidate: {
      id: input.id,
      target: input.target,
      source: input.source ?? "derived",
      reasonCodes: input.reasonCodes ?? [],
    },
    score: input.score,
    baseScore: input.score,
    uniquenessScore: input.matchCount === 1 ? 1 : 0,
    visibilityScore: input.matchCount === 1 ? 1 : 0,
    matchCount: input.matchCount,
    runtimeChecked: true,
    reasonCodes: input.reasonCodes ?? [],
  };
}

describe("selectBestCandidateForStep", () => {
  it("keeps a stronger recommendation report-only when below the high-confidence threshold", () => {
    const step: Step & { target: Target } = {
      action: "click",
      target: target("getByRole('textbox')"),
    };

    const current = score({
      id: "current",
      source: "current",
      target: step.target,
      score: 0.55,
      matchCount: 1,
      reasonCodes: ["existing_target"],
    });
    const suggested = score({
      id: "suggested",
      target: target("getByLabel('Email')"),
      score: HIGH_CONFIDENCE_AUTO_APPLY_THRESHOLD - 0.01,
      matchCount: 1,
      reasonCodes: ["aria_label", "unique_match"],
    });

    const selection = selectBestCandidateForStep({
      scored: [suggested, current],
      step,
      applySelectors: true,
    });

    expect(selection).toMatchObject({
      improveOpportunity: true,
      adopt: false,
      highConfidence: false,
      runtimeValidatedSelection: true,
      recommendedTarget: suggested.candidate.target,
    });
  });

  it("auto-applies only when recommendation is high-confidence and unique", () => {
    const step: Step & { target: Target } = {
      action: "click",
      target: target("getByRole('textbox')"),
    };

    const current = score({
      id: "current",
      source: "current",
      target: step.target,
      score: 0.55,
      matchCount: 1,
      reasonCodes: ["existing_target"],
    });
    const suggested = score({
      id: "suggested",
      target: target("getByLabel('Email')"),
      score: 0.91,
      matchCount: 1,
      reasonCodes: ["aria_label", "unique_match"],
    });

    const selection = selectBestCandidateForStep({
      scored: [suggested, current],
      step,
      applySelectors: true,
    });

    expect(selection).toMatchObject({
      improveOpportunity: true,
      adopt: true,
      highConfidence: true,
      runtimeValidatedSelection: true,
      recommendedTarget: suggested.candidate.target,
    });
  });
});
