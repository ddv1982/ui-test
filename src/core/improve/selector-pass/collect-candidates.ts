import type { Page } from "playwright";
import type { Step, Target } from "../../yaml-schema.js";
import { DEFAULT_SCORING_TIMEOUT_MS } from "../improve-types.js";
import type { ImproveDiagnostic } from "../report-schema.js";
import { generateTargetCandidates, type TargetCandidate } from "../candidate-generator.js";
import { generateAriaTargetCandidates } from "../candidate-generator-aria.js";
import { assessTargetDynamics } from "../dynamic-target.js";
import { analyzeAndBuildLocatorRepairCandidates } from "../locator-repair.js";
import { generateRuntimeRepairCandidates } from "../selector-runtime-repair.js";
import { selectorTargetKey } from "./selector-target-key.js";

type StepWithTarget = Step & { target: Target };

export interface CollectedCandidatesResult {
  candidates: TargetCandidate[];
  selectorRepairCandidatesAdded: number;
  selectorRepairsGeneratedByPlaywrightRuntime: number;
  selectorRepairsGeneratedByPrivateFallback: number;
  runtimeRepairCandidateKeys: Set<string>;
  privateFallbackRuntimeRepairCandidateKeys: Set<string>;
}

export async function collectCandidatesForStep(input: {
  step: StepWithTarget;
  page: Page | undefined;
  originalIndex: number;
  runtimeRegenerationDisabled: boolean;
  diagnostics: ImproveDiagnostic[];
}): Promise<CollectedCandidatesResult> {
  const candidates = generateTargetCandidates(input.step.target);
  const existingCandidateKeys = new Set(
    candidates.map((candidate) => selectorTargetKey(candidate.target))
  );
  const runtimeRepairCandidateKeys = new Set<string>();
  const privateFallbackRuntimeRepairCandidateKeys = new Set<string>();

  const dynamicAssessment = assessTargetDynamics(input.step.target);
  let dynamicSignals = [...dynamicAssessment.dynamicSignals];
  const currentCandidate = candidates.find((candidate) => candidate.source === "current");
  if (currentCandidate && dynamicSignals.length > 0) {
    currentCandidate.dynamicSignals = [...dynamicSignals];
  }

  const locatorRepair = analyzeAndBuildLocatorRepairCandidates({
    target: input.step.target,
    stepNumber: input.originalIndex + 1,
  });
  input.diagnostics.push(...locatorRepair.diagnostics);
  dynamicSignals = [...new Set([...dynamicSignals, ...locatorRepair.dynamicSignals])];
  if (currentCandidate && dynamicSignals.length > 0) {
    currentCandidate.dynamicSignals = [...dynamicSignals];
  }

  let selectorRepairCandidatesAdded = 0;
  for (const candidate of locatorRepair.candidates) {
    const key = selectorTargetKey(candidate.target);
    if (existingCandidateKeys.has(key)) continue;
    existingCandidateKeys.add(key);
    candidates.push(candidate);
    selectorRepairCandidatesAdded += 1;
  }

  let selectorRepairsGeneratedByPlaywrightRuntime = 0;
  let selectorRepairsGeneratedByPrivateFallback = 0;
  if (input.page && dynamicSignals.length > 0) {
    if (input.runtimeRegenerationDisabled) {
      input.diagnostics.push({
        code: "selector_repair_playwright_runtime_disabled",
        level: "info",
        message:
          `Step ${input.originalIndex + 1}: skipped Playwright runtime selector regeneration because UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN=1.`,
      });
    } else {
      const runtimeRepair = await generateRuntimeRepairCandidates({
        page: input.page,
        target: input.step.target,
        stepNumber: input.originalIndex + 1,
        dynamicSignals,
      });
      input.diagnostics.push(...runtimeRepair.diagnostics);
      const markerByCandidateId = new Map(
        runtimeRepair.sourceMarkers.map((marker) => [marker.candidateId, marker.source])
      );

      for (const candidate of runtimeRepair.candidates) {
        const key = selectorTargetKey(candidate.target);
        if (existingCandidateKeys.has(key)) continue;
        existingCandidateKeys.add(key);
        runtimeRepairCandidateKeys.add(key);
        if (markerByCandidateId.get(candidate.id) === "resolved_selector_fallback") {
          privateFallbackRuntimeRepairCandidateKeys.add(key);
          selectorRepairsGeneratedByPrivateFallback += 1;
        }
        candidates.push(candidate);
        selectorRepairCandidatesAdded += 1;
        selectorRepairsGeneratedByPlaywrightRuntime += 1;
      }
    }
  }

  if (input.page) {
    const existingValues = new Set(candidates.map((candidate) => candidate.target.value));
    const ariaResult = await generateAriaTargetCandidates(
      input.page,
      input.step.target,
      existingValues,
      DEFAULT_SCORING_TIMEOUT_MS
    );
    for (const candidate of ariaResult.candidates) {
      const key = selectorTargetKey(candidate.target);
      if (existingCandidateKeys.has(key)) continue;
      existingCandidateKeys.add(key);
      candidates.push(candidate);
    }
    input.diagnostics.push(...ariaResult.diagnostics);
  }

  return {
    candidates,
    selectorRepairCandidatesAdded,
    selectorRepairsGeneratedByPlaywrightRuntime,
    selectorRepairsGeneratedByPrivateFallback,
    runtimeRepairCandidateKeys,
    privateFallbackRuntimeRepairCandidateKeys,
  };
}
