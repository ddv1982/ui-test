import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepNetworkIdle,
} from "../runtime/network-idle.js";
import type { FallbackTarget, Step, Target } from "../yaml-schema.js";
import type { StepSnapshot } from "./assertion-candidates-snapshot.js";
import { generateAriaTargetCandidates } from "./candidate-generator-aria.js";
import { generateTargetCandidates } from "./candidate-generator.js";
import {
  scoreTargetCandidates,
  shouldAdoptCandidate,
} from "./candidate-scorer.js";
import { chooseDeterministicSelection, roundScore } from "./improve-helpers.js";
import {
  DEFAULT_RUNTIME_TIMEOUT_MS,
  DEFAULT_SCORING_TIMEOUT_MS,
} from "./improve-types.js";
import type { ImproveDiagnostic, StepFinding } from "./report-schema.js";
import { analyzeAndBuildLocatorRepairCandidates } from "./locator-repair.js";

export interface SelectorPassResult {
  outputSteps: Step[];
  findings: StepFinding[];
  nativeStepSnapshots: StepSnapshot[];
  failedStepIndexes: number[];
  selectorRepairCandidates: number;
  selectorRepairsApplied: number;
}

export async function runImproveSelectorPass(input: {
  steps: Step[];
  outputStepOriginalIndexes: number[];
  page?: Page;
  testBaseUrl?: string;
  applySelectors: boolean;
  wantsNativeSnapshots: boolean;
  diagnostics: ImproveDiagnostic[];
}): Promise<SelectorPassResult> {
  const outputSteps = [...input.steps];
  const findings: StepFinding[] = [];
  const nativeStepSnapshots: StepSnapshot[] = [];
  const failedStepIndexes: number[] = [];
  let selectorRepairCandidates = 0;
  let selectorRepairsApplied = 0;

  for (let index = 0; index < outputSteps.length; index += 1) {
    const step = outputSteps[index];
    if (!step) continue;

    const originalIndex = input.outputStepOriginalIndexes[index] ?? index;

    if (step.action !== "navigate" && "target" in step && step.target) {
      const candidates = generateTargetCandidates(step.target);
      const existingCandidateKeys = new Set(
        candidates.map((candidate) => selectorTargetKey(candidate.target))
      );

      const repairAnalysis = analyzeAndBuildLocatorRepairCandidates({
        target: step.target,
        stepNumber: originalIndex + 1,
      });
      input.diagnostics.push(...repairAnalysis.diagnostics);
      for (const candidate of repairAnalysis.candidates) {
        const key = selectorTargetKey(candidate.target);
        if (existingCandidateKeys.has(key)) continue;
        existingCandidateKeys.add(key);
        candidates.push(candidate);
        selectorRepairCandidates += 1;
      }

      if (input.page) {
        const existingValues = new Set(candidates.map((candidate) => candidate.target.value));
        const ariaResult = await generateAriaTargetCandidates(
          input.page,
          step.target,
          existingValues,
          DEFAULT_SCORING_TIMEOUT_MS
        );
        candidates.push(...ariaResult.candidates);
        input.diagnostics.push(...ariaResult.diagnostics);
      }

      const scored = await scoreTargetCandidates(
        input.page,
        candidates,
        DEFAULT_SCORING_TIMEOUT_MS
      );
      const current =
        scored.find((item) => item.candidate.source === "current") ?? scored[0];
      if (!current) {
        input.diagnostics.push({
          code: "candidate_scoring_unavailable",
          level: "warn",
          message: `Step ${originalIndex + 1}: no selector candidates were available for scoring.`,
        });
        continue;
      }

      const selected = chooseDeterministicSelection(scored, current);
      const improveOpportunity = shouldAdoptCandidate(current, selected);
      const runtimeValidatedSelection = selected.matchCount === 1;
      const adopt =
        improveOpportunity && (!input.applySelectors || runtimeValidatedSelection);
      const recommendedTarget = adopt ? selected.candidate.target : step.target;
      const confidenceDelta = roundScore(selected.score - current.score);
      const reasonCodes = [
        ...new Set([...current.reasonCodes, ...selected.reasonCodes]),
      ];

      if (input.applySelectors && !adopt && improveOpportunity) {
        input.diagnostics.push({
          code: "apply_requires_runtime_unique_match",
          level: "warn",
          message: `Step ${originalIndex + 1}: skipped apply because candidate did not have a unique runtime match.`,
        });
      }

      findings.push({
        index: originalIndex,
        action: step.action,
        changed: adopt,
        oldTarget: step.target,
        recommendedTarget,
        oldScore: current.score,
        recommendedScore: selected.score,
        confidenceDelta,
        reasonCodes,
      });

      if (input.applySelectors && adopt) {
        if (selected.reasonCodes.some((reasonCode) => reasonCode.startsWith("locator_repair_"))) {
          selectorRepairsApplied += 1;
          input.diagnostics.push({
            code: "selector_repair_applied",
            level: "info",
            message:
              `Step ${originalIndex + 1}: applied selector repair candidate (${selected.reasonCodes.join(", ")}).`,
          });
        }

        // Collect up to 2 runner-up candidates as fallbacks
        const fallbacks: FallbackTarget[] = [];
        const selectedValue = selected.candidate.target.value;
        for (const candidate of scored) {
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

        outputSteps[index] = {
          ...step,
          target: {
            ...recommendedTarget,
            ...(fallbacks.length > 0 ? { fallbacks } : {}),
          },
        };
      }
    }

    if (!input.page) {
      continue;
    }

    let preSnapshot: string | undefined;
    let preUrl: string | undefined;
    let preTitle: string | undefined;
    if (input.wantsNativeSnapshots) {
      preSnapshot = await input.page
        .locator("body")
        .ariaSnapshot({ timeout: DEFAULT_SCORING_TIMEOUT_MS })
        .catch(() => undefined);
      try {
        preUrl = input.page.url();
        preTitle = await input.page.title();
      } catch {
        preUrl = "";
        preTitle = "";
      }
    }

    try {
      const runtimeStep = outputSteps[index] ?? step;
      await executeRuntimeStep(
        input.page,
        runtimeStep,
        input.testBaseUrl === undefined
          ? { timeout: DEFAULT_RUNTIME_TIMEOUT_MS, mode: "analysis" }
          : {
              timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
              baseUrl: input.testBaseUrl,
              mode: "analysis",
            }
      );
    } catch (err) {
      failedStepIndexes.push(index);
      input.diagnostics.push({
        code: "runtime_step_execution_failed",
        level: "warn",
        message:
          err instanceof Error
            ? `Runtime execution failed at step ${originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
            : `Runtime execution failed at step ${originalIndex + 1}; continuing with best-effort analysis.`,
      });
    }

    if (input.wantsNativeSnapshots) {
      try {
        const networkIdleTimedOut = await waitForPostStepNetworkIdle(
          input.page,
          DEFAULT_WAIT_FOR_NETWORK_IDLE
        );
        if (networkIdleTimedOut) {
          input.diagnostics.push({
            code: "runtime_network_idle_wait_timed_out",
            level: "warn",
            message: `Runtime network idle wait timed out at step ${originalIndex + 1}; capturing best-effort snapshot state.`,
          });
        }
      } catch (err) {
        input.diagnostics.push({
          code: "runtime_network_idle_wait_failed",
          level: "warn",
          message:
            err instanceof Error
              ? `Runtime network idle wait failed at step ${originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
              : `Runtime network idle wait failed at step ${originalIndex + 1}; continuing with best-effort analysis.`,
        });
      }
    }

    if (input.wantsNativeSnapshots && preSnapshot !== undefined) {
      const postSnapshot = await input.page
        .locator("body")
        .ariaSnapshot({ timeout: DEFAULT_SCORING_TIMEOUT_MS })
        .catch(() => undefined);
      if (postSnapshot) {
        let postUrl = "";
        let postTitle = "";
        try {
          postUrl = input.page.url();
          postTitle = await input.page.title();
        } catch {
          postUrl = "";
          postTitle = "";
        }
        const stepSnapshot: StepSnapshot = {
          index,
          step,
          preSnapshot,
          postSnapshot,
        };
        if (preUrl !== undefined) stepSnapshot.preUrl = preUrl;
        if (postUrl !== undefined) stepSnapshot.postUrl = postUrl;
        if (preTitle !== undefined) stepSnapshot.preTitle = preTitle;
        if (postTitle !== undefined) stepSnapshot.postTitle = postTitle;
        nativeStepSnapshots.push(stepSnapshot);
      }
    }
  }

  return {
    outputSteps,
    findings,
    nativeStepSnapshots,
    failedStepIndexes,
    selectorRepairCandidates,
    selectorRepairsApplied,
  };
}

function selectorTargetKey(target: Target): string {
  return JSON.stringify({
    value: target.value,
    kind: target.kind,
    source: target.source,
    framePath: target.framePath ?? [],
  });
}
