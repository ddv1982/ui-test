import { setTimeout as sleep } from "node:timers/promises";
import type { BrowserContext, Page } from "playwright";
import { ui } from "../../utils/ui.js";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  dismissCookieBannerWithDetails,
  isLikelyOverlayInterceptionError,
} from "../runtime/cookie-banner.js";
import { waitForPostStepReadiness } from "../runtime/network-idle.js";
import type { Step } from "../yaml-schema.js";
import type { PlayFailureArtifactPaths } from "../play-failure-report.js";
import { captureFailureArtifacts, type TraceCaptureState } from "./artifact-writer.js";
import { stepDescription } from "./step-description.js";
import type { PlayFailureArtifacts, StepResult } from "./play-types.js";

const READINESS_WARNING_LIMIT = 3;

export interface StepLoopResult {
  stepResults: StepResult[];
  failureArtifacts?: PlayFailureArtifacts;
}

export async function runPlayStepLoop(input: {
  page: Page;
  context: BrowserContext;
  steps: Step[];
  timeout: number;
  delayMs: number;
  effectiveBaseUrl?: string;
  waitForNetworkIdle: boolean;
  runId: string;
  absoluteFilePath: string;
  testName: string;
  traceState: TraceCaptureState;
  artifactWarnings: string[];
  artifactPaths?: PlayFailureArtifactPaths;
}): Promise<StepLoopResult> {
  const stepResults: StepResult[] = [];
  let readinessWarnings = 0;
  let failureArtifacts: PlayFailureArtifacts | undefined;

  for (const [i, step] of input.steps.entries()) {
    const stepStart = Date.now();
    const desc = stepDescription(step, i);
    const dismissTimeout = Math.min(input.timeout, 1200);
    let shouldStop = false;
    let overlayRetryUsed = false;

    while (true) {
      let beforeUrl: string | undefined;
      try {
        beforeUrl = input.page.url();
      } catch {
        beforeUrl = undefined;
      }

      const dismissResult = await dismissCookieBannerWithDetails(
        input.page,
        dismissTimeout
      ).catch(() => ({ dismissed: false } as const));
      if (dismissResult.dismissed) {
        const dismissedLabel =
          dismissResult.category === "non_cookie_overlay"
            ? "non-cookie overlay"
            : "cookie banner";
        input.artifactWarnings.push(
          `Step ${i + 1}: dismissed ${dismissedLabel} via ${dismissResult.strategy ?? "unknown"}${dismissResult.frameUrl ? ` (${dismissResult.frameUrl})` : ""}.`
        );
      }

      try {
        const stepExecutionOptions =
          input.effectiveBaseUrl === undefined
            ? { timeout: input.timeout, mode: "playback" as const }
            : {
                timeout: input.timeout,
                baseUrl: input.effectiveBaseUrl,
                mode: "playback" as const,
              };
        await executeRuntimeStep(input.page, step, {
          ...stepExecutionOptions,
        });

        const readiness = await waitForPostStepReadiness({
          page: input.page,
          step,
          waitForNetworkIdle: input.waitForNetworkIdle,
          timeoutMs: input.timeout,
          beforeUrl,
        });

        if (readiness.navigationTimedOut) {
          readinessWarnings += 1;
          if (readinessWarnings <= READINESS_WARNING_LIMIT) {
            ui.warn(
              `Step ${i + 1} (${step.action}): navigation readiness wait timed out; continuing.`
            );
          } else if (readinessWarnings === READINESS_WARNING_LIMIT + 1) {
            ui.warn(
              "Additional post-step readiness warnings will be suppressed for this test file."
            );
          }
        }

        if (readiness.networkIdleTimedOut) {
          readinessWarnings += 1;
          if (readinessWarnings <= READINESS_WARNING_LIMIT) {
            ui.warn(
              `Step ${i + 1} (${step.action}): network idle wait timed out; continuing.`
            );
          } else if (readinessWarnings === READINESS_WARNING_LIMIT + 1) {
            ui.warn(
              "Additional post-step readiness warnings will be suppressed for this test file."
            );
          }
        }

        const result: StepResult = {
          step,
          index: i,
          passed: true,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.success(`${desc} (${result.durationMs}ms)`);

        if (input.delayMs > 0 && i < input.steps.length - 1) {
          await sleep(input.delayMs);
        }
        break;
      } catch (err) {
        if (!overlayRetryUsed && isLikelyOverlayInterceptionError(err)) {
          overlayRetryUsed = true;
          const retryDismissResult = await dismissCookieBannerWithDetails(
            input.page,
            dismissTimeout
          ).catch(() => ({ dismissed: false } as const));
          if (retryDismissResult.dismissed) {
            const retriedLabel =
              retryDismissResult.category === "non_cookie_overlay"
                ? "overlay"
                : "consent overlay";
            input.artifactWarnings.push(
              `Step ${i + 1}: retried after ${retriedLabel} dismissal.`
            );
            ui.warn(
              `Step ${i + 1} (${step.action}): retrying after ${retriedLabel} dismissal.`
            );
            continue;
          }
        }

        const errorMessage = err instanceof Error ? err.message : String(err);

        const result: StepResult = {
          step,
          index: i,
          passed: false,
          error: errorMessage,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.error(`${desc}: ${errorMessage}`);

        if (input.artifactPaths) {
          failureArtifacts = await captureFailureArtifacts({
            context: input.context,
            page: input.page,
            traceState: input.traceState,
            artifactPaths: input.artifactPaths,
            runId: input.runId,
            absoluteFilePath: input.absoluteFilePath,
            testName: input.testName,
            step,
            stepIndex: i,
            errorMessage,
            stepResult: result,
            stepResults,
            artifactWarnings: input.artifactWarnings,
          });
        }

        shouldStop = true;
        break;
      }
    }

    if (shouldStop) {
      break;
    }
  }

  return failureArtifacts === undefined
    ? { stepResults }
    : { stepResults, failureArtifacts };
}
