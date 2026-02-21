import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepNetworkIdle,
} from "../runtime/network-idle.js";
import type { Step } from "../yaml-schema.js";
import type { AssertionApplyOutcome } from "./assertion-apply-types.js";
import type {
  AssertionApplyValidationOptions,
  AssertionCandidateRef,
} from "./assertion-apply-types.js";
import { compareAssertionCandidateRefs, DEFAULT_ASSERTION_POLICY_CONFIG } from "./assertion-apply-selection.js";
import { isDuplicateSourceOrAdjacentAssertion } from "./assertion-apply-insertion.js";

export async function validateCandidatesAgainstRuntime(
  page: Page,
  steps: Step[],
  candidates: AssertionCandidateRef[],
  options: AssertionApplyValidationOptions
): Promise<AssertionApplyOutcome[]> {
  const policyConfig = options.policyConfig ?? DEFAULT_ASSERTION_POLICY_CONFIG;
  const outcomes: AssertionApplyOutcome[] = [];
  const candidatesByStepIndex = new Map<number, AssertionCandidateRef[]>();
  const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;

  for (const candidateRef of candidates) {
    if (
      isDuplicateSourceOrAdjacentAssertion(
        steps,
        candidateRef.candidate.index,
        candidateRef.candidate.candidate
      )
    ) {
      outcomes.push({
        candidateIndex: candidateRef.candidateIndex,
        applyStatus: "skipped_existing",
        applyMessage: "Equivalent assertion already exists at source step or adjacent position.",
      });
      continue;
    }

    const existing = candidatesByStepIndex.get(candidateRef.candidate.index) ?? [];
    existing.push(candidateRef);
    candidatesByStepIndex.set(candidateRef.candidate.index, existing);
  }

  for (const [stepIndex, stepCandidates] of candidatesByStepIndex) {
    stepCandidates.sort((left, right) =>
      compareAssertionCandidateRefs(left, right, policyConfig)
    );
    candidatesByStepIndex.set(stepIndex, stepCandidates);
  }

  if (candidatesByStepIndex.size === 0) return outcomes;

  if ("goto" in page && typeof page.goto === "function") {
    await page
      .goto("about:blank", {
        timeout: options.timeout,
      })
      .catch(() => {});
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step) continue;

    try {
      await executeRuntimeStep(
        page,
        step,
        options.baseUrl === undefined
          ? { timeout: options.timeout, mode: "analysis" }
          : { timeout: options.timeout, baseUrl: options.baseUrl, mode: "analysis" }
      );
      const networkIdleTimedOut = await waitForPostStepNetworkIdle(
        page,
        waitForNetworkIdle
      );
      if (networkIdleTimedOut) {
        for (const candidateRef of candidatesByStepIndex.get(index) ?? []) {
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: "skipped_runtime_failure",
            applyMessage: "Post-step network idle wait timed out; assertion skipped.",
          });
        }
        continue;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown runtime replay failure.";
      for (const [stepIndex, stepCandidates] of candidatesByStepIndex) {
        if (stepIndex < index) continue;
        for (const candidateRef of stepCandidates) {
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: "skipped_runtime_failure",
            applyMessage: `Runtime replay failed at step ${index + 1}: ${message}`,
          });
        }
      }
      return outcomes;
    }

    const stepCandidates = candidatesByStepIndex.get(index) ?? [];
    let appliedForStep = 0;
    let appliedNonFallbackForStep = false;
    for (const candidateRef of stepCandidates) {
      if (appliedForStep >= policyConfig.appliedAssertionsPerStepCap) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_policy",
          applyMessage:
            `Skipped by policy: max ${policyConfig.appliedAssertionsPerStepCap} applied assertion(s) per source step.`,
        });
        continue;
      }
      if (
        candidateRef.candidate.coverageFallback === true &&
        appliedNonFallbackForStep
      ) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_policy",
          applyMessage:
            "Skipped by policy: coverage fallback assertions are backup-only once a stronger assertion is applied for this step.",
        });
        continue;
      }
      try {
        await executeRuntimeStep(
          page,
          candidateRef.candidate.candidate,
          options.baseUrl === undefined
            ? { timeout: options.timeout, mode: "playback" }
            : { timeout: options.timeout, baseUrl: options.baseUrl, mode: "playback" }
        );
        appliedForStep += 1;
        if (candidateRef.candidate.coverageFallback !== true) {
          appliedNonFallbackForStep = true;
        }
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "applied",
        });
      } catch (err) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_runtime_failure",
          applyMessage:
            err instanceof Error
              ? err.message
              : "Assertion runtime validation failed.",
        });
      }
    }
  }

  return outcomes;
}
