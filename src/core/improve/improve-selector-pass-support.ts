import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepReadiness,
} from "../runtime/network-idle.js";
import { dismissCookieBannerWithDetails } from "../runtime/cookie-banner.js";
import type { Step, Target } from "../yaml-schema.js";
import type { StepSnapshot } from "./assertion-candidates/assertion-candidates-snapshot.js";
import { scoreTargetCandidates } from "./candidate-scorer.js";
import {
  DEFAULT_RUNTIME_TIMEOUT_MS,
  DEFAULT_SCORING_TIMEOUT_MS,
} from "./improve-types.js";
import type { ImproveDiagnostic, StepFinding } from "./report-schema.js";
import { applySelectionAndRecordFinding } from "./selector-pass/apply-selection.js";
import { collectCandidatesForStep } from "./selector-pass/collect-candidates.js";
import { selectBestCandidateForStep } from "./selector-pass/select-candidate.js";
import { prepareScopedStepSnapshot } from "./step-snapshot-scope.js";

type StepWithTarget = Step & { target: Target };
type SelectorMetricsAccumulator = {
  selectorRepairCandidates: number;
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsGeneratedByPlaywrightRuntime: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
};

export interface SelectorSelectionMetrics {
  selectorRepairCandidatesAdded: number;
  selectorRepairsGeneratedByPlaywrightRuntime: number;
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
}

export async function processSelectorStep(input: {
  step: StepWithTarget;
  stepIndex: number;
  originalIndex: number;
  page?: Page;
  applySelectors: boolean;
  runtimeRegenerationDisabled: boolean;
  outputSteps: Step[];
  findings: StepFinding[];
  diagnostics: ImproveDiagnostic[];
}): Promise<SelectorSelectionMetrics> {
  const candidateCollection = await collectCandidatesForStep({
    step: input.step,
    page: input.page,
    originalIndex: input.originalIndex,
    runtimeRegenerationDisabled: input.runtimeRegenerationDisabled,
    diagnostics: input.diagnostics,
  });

  const scored = await scoreTargetCandidates(
    input.page,
    candidateCollection.candidates,
    DEFAULT_SCORING_TIMEOUT_MS
  );
  const selection = selectBestCandidateForStep({
    scored,
    step: input.step,
    applySelectors: input.applySelectors,
  });
  if (!selection) {
    input.diagnostics.push({
      code: "candidate_scoring_unavailable",
      level: "warn",
      message: `Step ${input.originalIndex + 1}: no selector candidates were available for scoring.`,
    });
    return {
      selectorRepairCandidatesAdded: candidateCollection.selectorRepairCandidatesAdded,
      selectorRepairsGeneratedByPlaywrightRuntime:
        candidateCollection.selectorRepairsGeneratedByPlaywrightRuntime,
      selectorRepairsApplied: 0,
      selectorRepairsAdoptedOnTie: 0,
      selectorRepairsAppliedFromPlaywrightRuntime: 0,
    };
  }

  input.findings.push({
    index: input.originalIndex,
    action: input.step.action,
    changed: selection.adopt,
    oldTarget: input.step.target,
    recommendedTarget: selection.recommendedTarget,
    oldScore: selection.current.score,
    recommendedScore: selection.effectiveSelected.score,
    confidenceDelta: selection.confidenceDelta,
    reasonCodes: selection.reasonCodes,
  });

  if (!input.applySelectors) {
    return {
      selectorRepairCandidatesAdded: candidateCollection.selectorRepairCandidatesAdded,
      selectorRepairsGeneratedByPlaywrightRuntime:
        candidateCollection.selectorRepairsGeneratedByPlaywrightRuntime,
      selectorRepairsApplied: 0,
      selectorRepairsAdoptedOnTie: 0,
      selectorRepairsAppliedFromPlaywrightRuntime: 0,
    };
  }

  const applyMetrics = applySelectionAndRecordFinding({
    outputSteps: input.outputSteps,
    step: input.step,
    stepIndex: input.stepIndex,
    originalIndex: input.originalIndex,
    selection,
    scored,
    diagnostics: input.diagnostics,
    runtimeRepairCandidateKeys: candidateCollection.runtimeRepairCandidateKeys,
  });

  return {
    selectorRepairCandidatesAdded: candidateCollection.selectorRepairCandidatesAdded,
    selectorRepairsGeneratedByPlaywrightRuntime:
      candidateCollection.selectorRepairsGeneratedByPlaywrightRuntime,
    selectorRepairsApplied: applyMetrics.selectorRepairsApplied,
    selectorRepairsAdoptedOnTie: applyMetrics.selectorRepairsAdoptedOnTie,
    selectorRepairsAppliedFromPlaywrightRuntime:
      applyMetrics.selectorRepairsAppliedFromPlaywrightRuntime,
  };
}

export async function processRuntimeStep(input: {
  page: Page;
  step: Step;
  runtimeStep: Step;
  originalIndex: number;
  wantsNativeSnapshots: boolean;
  testBaseUrl?: string;
  diagnostics: ImproveDiagnostic[];
}): Promise<{ failed: boolean; snapshot?: StepSnapshot; observedUrl?: string }> {
  let scopedSnapshot:
    | {
        preSnapshot: string;
        capturePostSnapshot: () => Promise<string | undefined>;
        scope: NonNullable<StepSnapshot["scope"]>;
      }
    | undefined;
  let preUrl: string | undefined;
  let preTitle: string | undefined;

  if (input.wantsNativeSnapshots) {
    scopedSnapshot = await prepareScopedStepSnapshot(
      input.page,
      input.step,
      DEFAULT_SCORING_TIMEOUT_MS
    );
    try {
      preUrl = input.page.url();
      preTitle = await input.page.title();
    } catch {
      preUrl = "";
      preTitle = "";
    }
  }

  let failed = false;

  try {
    let beforeUrl = preUrl;
    if (beforeUrl === undefined) {
      try {
        beforeUrl = input.page.url();
      } catch {
        beforeUrl = undefined;
      }
    }
    const dismissResult = await dismissCookieBannerWithDetails(
      input.page,
      Math.min(DEFAULT_RUNTIME_TIMEOUT_MS, 1200)
    ).catch(() => ({ dismissed: false } as const));
    if (dismissResult.dismissed && dismissResult.category === "non_cookie_overlay") {
      input.diagnostics.push({
        code: "overlay_dismissed_non_cookie",
        level: "info",
        message:
          `Step ${input.originalIndex + 1}: dismissed non-cookie overlay via ${dismissResult.strategy ?? "unknown"}${dismissResult.frameUrl ? ` (${dismissResult.frameUrl})` : ""}.`,
      });
    }

    await executeRuntimeStep(
      input.page,
      input.runtimeStep,
      input.testBaseUrl === undefined
        ? { timeout: DEFAULT_RUNTIME_TIMEOUT_MS, mode: "analysis" }
        : {
            timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
            baseUrl: input.testBaseUrl,
            mode: "analysis",
          }
    );

    try {
      const readiness = await waitForPostStepReadiness({
        page: input.page,
        step: input.runtimeStep,
        waitForNetworkIdle: DEFAULT_WAIT_FOR_NETWORK_IDLE,
        timeoutMs: DEFAULT_RUNTIME_TIMEOUT_MS,
        beforeUrl,
      });
      if (readiness.navigationTimedOut) {
        input.diagnostics.push({
          code: "runtime_navigation_readiness_wait_timed_out",
          level: "warn",
          message: `Runtime navigation readiness wait timed out at step ${input.originalIndex + 1}; capturing best-effort snapshot state.`,
        });
      }
      if (readiness.networkIdleTimedOut) {
        input.diagnostics.push({
          code: "runtime_network_idle_wait_timed_out",
          level: "warn",
          message: `Runtime network idle wait timed out at step ${input.originalIndex + 1}; capturing best-effort snapshot state.`,
        });
      }
    } catch (err) {
      input.diagnostics.push({
        code: "runtime_post_step_readiness_failed",
        level: "warn",
        message:
          err instanceof Error
            ? `Runtime readiness wait failed at step ${input.originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
            : `Runtime readiness wait failed at step ${input.originalIndex + 1}; continuing with best-effort analysis.`,
      });
    }
  } catch (err) {
    failed = true;
    input.diagnostics.push({
      code: "runtime_step_execution_failed",
      level: "warn",
      message:
        err instanceof Error
          ? `Runtime execution failed at step ${input.originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
          : `Runtime execution failed at step ${input.originalIndex + 1}; continuing with best-effort analysis.`,
    });
  }

  let observedUrl: string | undefined;
  try {
    observedUrl = input.page.url();
  } catch {
    observedUrl = undefined;
  }

  if (!input.wantsNativeSnapshots || !scopedSnapshot) {
    return observedUrl ? { failed, observedUrl } : { failed };
  }

  const postSnapshot = await scopedSnapshot.capturePostSnapshot();
  if (!postSnapshot) {
    return { failed };
  }

  let postUrl = "";
  let postTitle = "";
  try {
    postUrl = input.page.url();
    postTitle = await input.page.title();
  } catch {
    postUrl = "";
    postTitle = "";
  }

  const snapshot: StepSnapshot = {
    index: input.originalIndex,
    step: input.step,
    preSnapshot: scopedSnapshot.preSnapshot,
    postSnapshot,
    scope: scopedSnapshot.scope,
  };
  if (preUrl !== undefined) snapshot.preUrl = preUrl;
  if (postUrl !== undefined) snapshot.postUrl = postUrl;
  if (preTitle !== undefined) snapshot.preTitle = preTitle;
  if (postTitle !== undefined) snapshot.postTitle = postTitle;

  return observedUrl ? { failed, snapshot, observedUrl } : { failed, snapshot };
}

export function isPlaywrightRuntimeRegenerationDisabled(): boolean {
  return process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN"] === "1";
}

export function applySelectorMetrics(
  result: SelectorMetricsAccumulator,
  metrics: SelectorSelectionMetrics
): void {
  result.selectorRepairCandidates += metrics.selectorRepairCandidatesAdded;
  result.selectorRepairsGeneratedByPlaywrightRuntime +=
    metrics.selectorRepairsGeneratedByPlaywrightRuntime;
  result.selectorRepairsApplied += metrics.selectorRepairsApplied;
  result.selectorRepairsAdoptedOnTie += metrics.selectorRepairsAdoptedOnTie;
  result.selectorRepairsAppliedFromPlaywrightRuntime +=
    metrics.selectorRepairsAppliedFromPlaywrightRuntime;
}
