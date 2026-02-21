import type { FallbackTarget, Step, Target } from "../../yaml-schema.js";
import type { ImproveDiagnostic } from "../report-schema.js";
import type { TargetCandidateScore } from "../candidate-scorer.js";
import type { SelectorSelectionOutcome } from "./select-candidate.js";
import { selectorTargetKey } from "./selector-target-key.js";

type StepWithTarget = Step & { target: Target };

export function applySelectionAndRecordFinding(input: {
  outputSteps: Step[];
  step: StepWithTarget;
  stepIndex: number;
  originalIndex: number;
  selection: SelectorSelectionOutcome;
  scored: TargetCandidateScore[];
  diagnostics: ImproveDiagnostic[];
  runtimeRepairCandidateKeys: Set<string>;
  privateFallbackRuntimeRepairCandidateKeys: Set<string>;
}): {
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
  selectorRepairsAppliedFromPrivateFallback: number;
} {
  let selectorRepairsApplied = 0;
  let selectorRepairsAdoptedOnTie = 0;
  let selectorRepairsAppliedFromPlaywrightRuntime = 0;
  let selectorRepairsAppliedFromPrivateFallback = 0;

  if (!input.selection.adopt && input.selection.improveOpportunity) {
    input.diagnostics.push({
      code: "apply_requires_runtime_unique_match",
      level: "warn",
      message: `Step ${input.originalIndex + 1}: skipped apply because candidate did not have a unique runtime match.`,
    });
    return {
      selectorRepairsApplied,
      selectorRepairsAdoptedOnTie,
      selectorRepairsAppliedFromPlaywrightRuntime,
      selectorRepairsAppliedFromPrivateFallback,
    };
  }

  if (!input.selection.adopt) {
    return {
      selectorRepairsApplied,
      selectorRepairsAdoptedOnTie,
      selectorRepairsAppliedFromPlaywrightRuntime,
      selectorRepairsAppliedFromPrivateFallback,
    };
  }

  const selectedIsRepair = input.selection.effectiveSelected.reasonCodes.some((reasonCode) =>
    reasonCode.startsWith("locator_repair_")
  );

  if (input.selection.tieRepairRecommendation && selectedIsRepair) {
    selectorRepairsAdoptedOnTie += 1;
    input.diagnostics.push({
      code: "selector_repair_adopted_on_tie_for_dynamic_target",
      level: "info",
      message:
        `Step ${input.originalIndex + 1}: adopted dynamic selector repair candidate on score tie.`,
    });
  }

  if (selectedIsRepair) {
    selectorRepairsApplied += 1;
    const selectedKey = selectorTargetKey(input.selection.effectiveSelected.candidate.target);
    const selectedByRuntime =
      input.runtimeRepairCandidateKeys.has(selectedKey) &&
      input.selection.effectiveSelected.reasonCodes.includes(
        "locator_repair_playwright_runtime"
      );

    if (selectedByRuntime) {
      selectorRepairsAppliedFromPlaywrightRuntime += 1;
      if (input.privateFallbackRuntimeRepairCandidateKeys.has(selectedKey)) {
        selectorRepairsAppliedFromPrivateFallback += 1;
      }
    }

    input.diagnostics.push({
      code: "selector_repair_applied",
      level: "info",
      message:
        `Step ${input.originalIndex + 1}: applied selector repair candidate (${input.selection.effectiveSelected.reasonCodes.join(", ")}).`,
    });
  }

  const fallbacks: FallbackTarget[] = [];
  const selectedValue = input.selection.effectiveSelected.candidate.target.value;
  for (const candidate of input.scored) {
    if (fallbacks.length >= 2) break;
    if (candidate.candidate.target.value === selectedValue) continue;
    if (candidate.matchCount !== 1) continue;
    if (candidate.score < 0.5) continue;
    fallbacks.push({
      value: candidate.candidate.target.value,
      kind: candidate.candidate.target.kind,
      source: candidate.candidate.target.source,
    });
  }

  input.outputSteps[input.stepIndex] = {
    ...input.step,
    target: {
      ...input.selection.recommendedTarget,
      ...(fallbacks.length > 0 ? { fallbacks } : {}),
    },
  } as Step;

  return {
    selectorRepairsApplied,
    selectorRepairsAdoptedOnTie,
    selectorRepairsAppliedFromPlaywrightRuntime,
    selectorRepairsAppliedFromPrivateFallback,
  };
}
