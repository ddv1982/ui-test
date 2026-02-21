import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepNetworkIdle,
} from "../runtime/network-idle.js";
import { dismissCookieBannerWithDetails } from "../runtime/cookie-banner.js";
import type { Step, Target } from "../yaml-schema.js";
import type { StepSnapshot } from "./assertion-candidates-snapshot.js";
import { scoreTargetCandidates } from "./candidate-scorer.js";
import {
  DEFAULT_RUNTIME_TIMEOUT_MS,
  DEFAULT_SCORING_TIMEOUT_MS,
} from "./improve-types.js";
import type { ImproveDiagnostic, StepFinding } from "./report-schema.js";
import { applySelectionAndRecordFinding } from "./selector-pass/apply-selection.js";
import { collectCandidatesForStep } from "./selector-pass/collect-candidates.js";
import { selectBestCandidateForStep } from "./selector-pass/select-candidate.js";

export interface SelectorPassResult {
  outputSteps: Step[];
  findings: StepFinding[];
  nativeStepSnapshots: StepSnapshot[];
  failedStepIndexes: number[];
  selectorRepairCandidates: number;
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsGeneratedByPlaywrightRuntime: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
  selectorRepairsGeneratedByPrivateFallback: number;
  selectorRepairsAppliedFromPrivateFallback: number;
}

type StepWithTarget = Step & { target: Target };

export async function runImproveSelectorPass(input: {
  steps: Step[];
  outputStepOriginalIndexes: number[];
  page?: Page;
  testBaseUrl?: string;
  applySelectors: boolean;
  wantsNativeSnapshots: boolean;
  diagnostics: ImproveDiagnostic[];
}): Promise<SelectorPassResult> {
  const runtimeRegenerationDisabled = isPlaywrightRuntimeRegenerationDisabled();
  const outputSteps = [...input.steps];
  const findings: StepFinding[] = [];
  const nativeStepSnapshots: StepSnapshot[] = [];
  const failedStepIndexes: number[] = [];
  let selectorRepairCandidates = 0;
  let selectorRepairsApplied = 0;
  let selectorRepairsAdoptedOnTie = 0;
  let selectorRepairsGeneratedByPlaywrightRuntime = 0;
  let selectorRepairsAppliedFromPlaywrightRuntime = 0;
  let selectorRepairsGeneratedByPrivateFallback = 0;
  let selectorRepairsAppliedFromPrivateFallback = 0;

  for (let index = 0; index < outputSteps.length; index += 1) {
    const step = outputSteps[index];
    if (!step) continue;

    const originalIndex = input.outputStepOriginalIndexes[index] ?? index;

    if (step.action !== "navigate" && "target" in step && step.target) {
      const targetStep = step as StepWithTarget;
      const candidateCollection = await collectCandidatesForStep({
        step: targetStep,
        page: input.page,
        originalIndex,
        runtimeRegenerationDisabled,
        diagnostics: input.diagnostics,
      });
      selectorRepairCandidates += candidateCollection.selectorRepairCandidatesAdded;
      selectorRepairsGeneratedByPlaywrightRuntime +=
        candidateCollection.selectorRepairsGeneratedByPlaywrightRuntime;
      selectorRepairsGeneratedByPrivateFallback +=
        candidateCollection.selectorRepairsGeneratedByPrivateFallback;

      const scored = await scoreTargetCandidates(
        input.page,
        candidateCollection.candidates,
        DEFAULT_SCORING_TIMEOUT_MS
      );
      const selection = selectBestCandidateForStep({
        scored,
        step: targetStep,
        applySelectors: input.applySelectors,
      });
      if (!selection) {
        input.diagnostics.push({
          code: "candidate_scoring_unavailable",
          level: "warn",
          message: `Step ${originalIndex + 1}: no selector candidates were available for scoring.`,
        });
        continue;
      }

      findings.push({
        index: originalIndex,
        action: step.action,
        changed: selection.adopt,
        oldTarget: step.target,
        recommendedTarget: selection.recommendedTarget,
        oldScore: selection.current.score,
        recommendedScore: selection.effectiveSelected.score,
        confidenceDelta: selection.confidenceDelta,
        reasonCodes: selection.reasonCodes,
      });

      if (input.applySelectors) {
        const applyMetrics = applySelectionAndRecordFinding({
          outputSteps,
          step: targetStep,
          stepIndex: index,
          originalIndex,
          selection,
          scored,
          diagnostics: input.diagnostics,
          runtimeRepairCandidateKeys: candidateCollection.runtimeRepairCandidateKeys,
          privateFallbackRuntimeRepairCandidateKeys:
            candidateCollection.privateFallbackRuntimeRepairCandidateKeys,
        });
        selectorRepairsApplied += applyMetrics.selectorRepairsApplied;
        selectorRepairsAdoptedOnTie += applyMetrics.selectorRepairsAdoptedOnTie;
        selectorRepairsAppliedFromPlaywrightRuntime +=
          applyMetrics.selectorRepairsAppliedFromPlaywrightRuntime;
        selectorRepairsAppliedFromPrivateFallback +=
          applyMetrics.selectorRepairsAppliedFromPrivateFallback;
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
      const dismissResult = await dismissCookieBannerWithDetails(
        input.page,
        Math.min(DEFAULT_RUNTIME_TIMEOUT_MS, 1200)
      ).catch(() => ({ dismissed: false } as const));
      if (dismissResult.dismissed && dismissResult.category === "non_cookie_overlay") {
        input.diagnostics.push({
          code: "overlay_dismissed_non_cookie",
          level: "info",
          message:
            `Step ${originalIndex + 1}: dismissed non-cookie overlay via ${dismissResult.strategy ?? "unknown"}${dismissResult.frameUrl ? ` (${dismissResult.frameUrl})` : ""}.`,
        });
      }

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
    selectorRepairsAdoptedOnTie,
    selectorRepairsGeneratedByPlaywrightRuntime,
    selectorRepairsAppliedFromPlaywrightRuntime,
    selectorRepairsGeneratedByPrivateFallback,
    selectorRepairsAppliedFromPrivateFallback,
  };
}

function isPlaywrightRuntimeRegenerationDisabled(): boolean {
  return process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN"] === "1";
}
