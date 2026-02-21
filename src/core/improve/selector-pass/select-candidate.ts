import type { Step, Target } from "../../yaml-schema.js";
import {
  shouldAdoptCandidate,
  type TargetCandidateScore,
} from "../candidate-scorer.js";
import { chooseDeterministicSelection, roundScore } from "../improve-helpers.js";

const SCORE_TIE_EPSILON = 0.001;

export interface SelectorSelectionOutcome {
  current: TargetCandidateScore;
  selected: TargetCandidateScore;
  effectiveSelected: TargetCandidateScore;
  improveOpportunity: boolean;
  tieRepairRecommendation: boolean;
  adopt: boolean;
  recommendedTarget: Target;
  confidenceDelta: number;
  reasonCodes: string[];
}

type StepWithTarget = Step & { target: Target };

export function selectBestCandidateForStep(input: {
  scored: TargetCandidateScore[];
  step: StepWithTarget;
  applySelectors: boolean;
}): SelectorSelectionOutcome | undefined {
  const current =
    input.scored.find((item) => item.candidate.source === "current") ?? input.scored[0];
  if (!current) {
    return undefined;
  }

  const selected = chooseDeterministicSelection(input.scored, current);
  const improveOpportunity = shouldAdoptCandidate(current, selected);
  const currentDynamic =
    current.reasonCodes.includes("dynamic_target") ||
    (current.candidate.dynamicSignals?.length ?? 0) > 0;

  const tieRuntimeRepairCandidate =
    !improveOpportunity && currentDynamic
      ? input.scored.find((candidate) => {
          if (candidate.candidate.target.value === current.candidate.target.value) {
            return false;
          }
          const runtimeRepair = candidate.reasonCodes.includes(
            "locator_repair_playwright_runtime"
          );
          if (!runtimeRepair) return false;
          const tieScore = Math.abs(candidate.score - current.score) <= SCORE_TIE_EPSILON;
          if (!tieScore) return false;
          return candidate.matchCount === 1;
        })
      : undefined;

  const effectiveSelected = tieRuntimeRepairCandidate ?? selected;
  const tieRepairRecommendation = tieRuntimeRepairCandidate !== undefined;
  const runtimeValidatedSelection = effectiveSelected.matchCount === 1;
  const adopt =
    (improveOpportunity || tieRepairRecommendation) &&
    (!input.applySelectors || runtimeValidatedSelection);
  const recommendedTarget = adopt ? effectiveSelected.candidate.target : input.step.target;
  const confidenceDelta = roundScore(effectiveSelected.score - current.score);
  const reasonCodes = [
    ...new Set([...current.reasonCodes, ...effectiveSelected.reasonCodes]),
  ];

  return {
    current,
    selected,
    effectiveSelected,
    improveOpportunity,
    tieRepairRecommendation,
    adopt,
    recommendedTarget,
    confidenceDelta,
    reasonCodes,
  };
}
