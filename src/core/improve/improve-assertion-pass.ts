import type { Page } from "playwright";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import { type StepSnapshot } from "./assertion-candidates-snapshot.js";
import { buildSnapshotNativeAssertionCandidates } from "./assertion-candidates-snapshot-native.js";
import {
  type AssertionApplyOutcome,
  type AssertionCandidateRef,
  insertAppliedAssertions,
  selectCandidatesForApply,
  validateCandidatesAgainstRuntime,
} from "./assertion-apply.js";
import {
  ASSERTION_APPLY_MIN_CONFIDENCE,
  DEFAULT_RUNTIME_TIMEOUT_MS,
  type ImproveAssertionPolicy,
  type ImproveAssertionSource,
  type ImproveAssertionsMode,
} from "./improve-types.js";
import {
  buildOriginalToRuntimeIndex,
  dedupeAssertionCandidates,
} from "./improve-helpers.js";
import {
  assessAssertionCandidateStability,
  clampSmartSnapshotCandidateVolume,
  shouldFilterVolatileSnapshotTextCandidate,
} from "./assertion-stability.js";
import { resolveAssertionPolicyConfig } from "./assertion-policy.js";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
  ImproveDiagnostic,
} from "./report-schema.js";
import { UserError } from "../../utils/errors.js";

export interface AssertionPassResult {
  outputSteps: import("../yaml-schema.js").Step[];
  assertionCandidates: AssertionCandidate[];
  appliedAssertions: number;
  skippedAssertions: number;
  filteredVolatileCandidates: number;
}

export async function runImproveAssertionPass(input: {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  assertionPolicy: ImproveAssertionPolicy;
  applyAssertions: boolean;
  page?: Page;
  outputSteps: import("../yaml-schema.js").Step[];
  findings: import("./report-schema.js").StepFinding[];
  outputStepOriginalIndexes: number[];
  nativeStepSnapshots: StepSnapshot[];
  testBaseUrl?: string;
  diagnostics: ImproveDiagnostic[];
}): Promise<AssertionPassResult> {
  let outputSteps = [...input.outputSteps];
  const assertionPolicyConfig = resolveAssertionPolicyConfig(input.assertionPolicy);

  let rawAssertionCandidates =
    input.assertions === "candidates"
      ? buildAssertionCandidates(outputSteps, input.findings, input.outputStepOriginalIndexes)
      : [];

  if (input.assertions === "candidates" && input.assertionSource === "snapshot-native") {
    if (input.nativeStepSnapshots.length === 0) {
      input.diagnostics.push({
        code: "assertion_source_snapshot_native_empty",
        level: "warn",
        message:
          "snapshot-native assertion source did not produce usable step snapshots; falling back to deterministic candidates.",
      });
    } else {
      try {
        const snapshotCandidates = buildSnapshotNativeAssertionCandidates(
          input.nativeStepSnapshots
        ).map((candidate) => ({
          ...candidate,
          index: input.outputStepOriginalIndexes[candidate.index] ?? candidate.index,
        }));
        rawAssertionCandidates = dedupeAssertionCandidates([
          ...rawAssertionCandidates,
          ...snapshotCandidates,
        ]);
      } catch (err) {
        input.diagnostics.push({
          code: "assertion_source_snapshot_native_parse_failed",
          level: "warn",
          message:
            err instanceof Error
              ? "Failed to parse snapshot-native assertion candidates: " + err.message
              : "Failed to parse snapshot-native assertion candidates.",
        });
        input.diagnostics.push({
          code: "assertion_source_snapshot_native_fallback",
          level: "warn",
          message:
            "snapshot-native assertion source failed to parse; falling back to deterministic candidates.",
        });
      }
    }
  }

  rawAssertionCandidates = rawAssertionCandidates.map((candidate) => ({
    ...candidate,
    ...assessAssertionCandidateStability(candidate),
  }));

  const cappedSnapshotCandidateIndexes = clampSmartSnapshotCandidateVolume(
    rawAssertionCandidates,
    assertionPolicyConfig.snapshotCandidateVolumeCap
  );

  let assertionCandidates: AssertionCandidate[] = rawAssertionCandidates.map((candidate) => ({
    ...candidate,
    applyStatus: "not_requested" as const,
  }));
  let appliedAssertions = 0;
  let skippedAssertions = 0;
  let filteredVolatileCandidates = 0;

  if (input.applyAssertions && input.page) {
    const forcedPolicyMessages = new Map<number, string>();
    for (const candidateIndex of cappedSnapshotCandidateIndexes) {
      forcedPolicyMessages.set(
        candidateIndex,
        "Skipped by policy: snapshot candidate cap reached for this source step."
      );
    }

    const stepsWithStrongerCandidates = new Set<number>();
    for (const candidate of rawAssertionCandidates) {
      if (candidate.coverageFallback === true) continue;
      stepsWithStrongerCandidates.add(candidate.index);
    }
    for (
      let candidateIndex = 0;
      candidateIndex < rawAssertionCandidates.length;
      candidateIndex += 1
    ) {
      const candidate = rawAssertionCandidates[candidateIndex];
      if (!candidate || candidate.coverageFallback !== true) continue;
      if (!stepsWithStrongerCandidates.has(candidate.index)) continue;
      if (!forcedPolicyMessages.has(candidateIndex)) {
        forcedPolicyMessages.set(
          candidateIndex,
          "Skipped by policy: coverage fallback suppressed because stronger candidate exists for this step."
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < rawAssertionCandidates.length;
      candidateIndex += 1
    ) {
      const candidate = rawAssertionCandidates[candidateIndex];
      if (!candidate) continue;
      if (
        !shouldFilterVolatileSnapshotTextCandidate(
          candidate,
          assertionPolicyConfig.hardFilterVolatilityFlags
        )
      ) {
        continue;
      }
      filteredVolatileCandidates += 1;
      if (!forcedPolicyMessages.has(candidateIndex)) {
        forcedPolicyMessages.set(
          candidateIndex,
          "Skipped by policy: volatile snapshot text candidate is report-only."
        );
      }
      input.diagnostics.push({
        code: "assertion_candidate_filtered_volatile",
        level: "info",
        message:
          `Assertion candidate ${candidateIndex + 1} (step ${candidate.index + 1}) was marked volatile and skipped for auto-apply.`,
      });
    }

    const originalToRuntimeIndex = buildOriginalToRuntimeIndex(
      input.outputStepOriginalIndexes
    );
    const selection = selectCandidatesForApply(
      rawAssertionCandidates,
      ASSERTION_APPLY_MIN_CONFIDENCE,
      {
        perCandidateMinConfidence: (candidate) => {
          if (candidate.candidateSource !== "snapshot_native") {
            return ASSERTION_APPLY_MIN_CONFIDENCE;
          }
          if (candidate.candidate.action === "assertText") {
            return assertionPolicyConfig.snapshotTextMinScore;
          }
          return ASSERTION_APPLY_MIN_CONFIDENCE;
        },
        forcedPolicyMessages,
        useStabilityScore: true,
        policyConfig: assertionPolicyConfig,
      }
    );
    const runtimeSelection: AssertionCandidateRef[] = [];
    const unmappedOutcomes: AssertionApplyOutcome[] = [];

    for (const selectedCandidate of selection.selected) {
      const runtimeIndex = originalToRuntimeIndex.get(selectedCandidate.candidate.index);
      if (runtimeIndex === undefined) {
        unmappedOutcomes.push({
          candidateIndex: selectedCandidate.candidateIndex,
          applyStatus: "skipped_runtime_failure",
          applyMessage: `Candidate source step ${selectedCandidate.candidate.index + 1} could not be mapped to runtime replay index.`,
        });
        continue;
      }
      runtimeSelection.push({
        candidateIndex: selectedCandidate.candidateIndex,
        candidate: {
          ...selectedCandidate.candidate,
          index: runtimeIndex,
        },
      });
    }

    const outcomes = await validateCandidatesAgainstRuntime(
      input.page,
      outputSteps,
      runtimeSelection,
      {
        timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
        baseUrl: input.testBaseUrl,
        policyConfig: assertionPolicyConfig,
      }
    );

    const allOutcomes = [
      ...selection.skippedLowConfidence,
      ...selection.skippedPolicy,
      ...unmappedOutcomes,
      ...outcomes,
    ];

    const outcomeByCandidate = new Map<
      number,
      { applyStatus: AssertionApplyStatus; applyMessage?: string }
    >();

    for (const outcome of allOutcomes) {
      outcomeByCandidate.set(outcome.candidateIndex, {
        applyStatus: outcome.applyStatus,
        applyMessage: outcome.applyMessage,
      });
      if (outcome.applyStatus === "applied") {
        appliedAssertions += 1;
      } else {
        skippedAssertions += 1;
        if (outcome.applyStatus === "skipped_runtime_failure") {
          input.diagnostics.push({
            code: "assertion_apply_runtime_failure",
            level: "warn",
            message: `Assertion candidate ${outcome.candidateIndex + 1} skipped: ${outcome.applyMessage ?? "runtime validation failed"}`,
          });
        }
      }
    }

    const appliedInsertions = outcomes
      .filter((outcome) => outcome.applyStatus === "applied")
      .map((outcome) => {
        const candidate = rawAssertionCandidates[outcome.candidateIndex];
        if (!candidate) {
          throw new UserError(
            "Assertion candidate index was out of range during apply."
          );
        }
        const runtimeIndex = originalToRuntimeIndex.get(candidate.index);
        if (runtimeIndex === undefined) {
          throw new UserError(
            "Assertion candidate source index could not be mapped to runtime index during apply."
          );
        }
        return {
          sourceIndex: runtimeIndex,
          assertionStep: candidate.candidate,
        };
      });

    outputSteps = insertAppliedAssertions(outputSteps, appliedInsertions);
    assertionCandidates = rawAssertionCandidates.map((candidate, candidateIndex) => {
      const outcome = outcomeByCandidate.get(candidateIndex);
      if (!outcome) {
        return {
          ...candidate,
          applyStatus: "not_requested" as const,
        };
      }
      return {
        ...candidate,
        applyStatus: outcome.applyStatus,
        ...(outcome.applyMessage ? { applyMessage: outcome.applyMessage } : {}),
      };
    });
  }

  return {
    outputSteps,
    assertionCandidates,
    appliedAssertions,
    skippedAssertions,
    filteredVolatileCandidates,
  };
}
