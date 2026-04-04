import type { Step, TestFile } from "../yaml-schema.js";
import type { StepSnapshot } from "./assertion-candidates/assertion-candidates-snapshot.js";
import { classifyRuntimeFailingStep } from "./runtime-failure-classifier.js";
import {
  RUNTIME_STEP_REMOVE_MIN_CONFIDENCE,
  type ImproveAppliedBy,
  type ImproveAssertionSource,
  type ImproveOptions,
} from "./improve-types.js";
import type {
  ImproveAppliedBy as ImproveAppliedByReport,
  ImproveDeterminism,
  ImproveDeterminismReason,
  ImproveDiagnostic,
  ImproveMutationType,
  StepFinding,
} from "./report-schema.js";

export interface ImproveExecutionPlan {
  needsBrowser: boolean;
  wantsNativeSnapshots: boolean;
}

export interface RuntimeFailureResolution {
  failedIndexesToRemove: Set<number>;
  failedIndexesToRetain: Set<number>;
}

export interface ImproveDeterminismCapabilities {
  allowRuntimeDerivedApply: boolean;
  allowRuntimeSelectorRepairApply: boolean;
  allowRuntimeAssertionApply: boolean;
  emitDeterminismDiagnostics: boolean;
  determinism: ImproveDeterminism;
}

export interface PostRemovalState {
  outputSteps: Step[];
  outputStepOriginalIndexes: number[];
  nativeStepSnapshots: StepSnapshot[];
  findings: StepFinding[];
}

type TestMetadata = Pick<TestFile, "name" | "description" | "baseUrl">;
type TestDocument = {
  name: string;
  description?: string;
  baseUrl?: string;
  steps: Step[];
};

const DETERMINISM_REASON_CODES = {
  missingBaseUrl: "missing_base_url",
  replayHostMismatch: "replay_host_mismatch",
  crossOriginDrift: "cross_origin_drift",
} as const;

export function resolveImproveExecutionPlan(input: {
  applySelectors: boolean;
  applyAssertions: boolean;
  assertions: ImproveOptions["assertions"];
  assertionSource: ImproveAssertionSource;
}): ImproveExecutionPlan {
  const wantsNativeSnapshots =
    input.assertions === "candidates" && input.assertionSource === "snapshot-native";
  const needsBrowser =
    input.applySelectors || input.applyAssertions || wantsNativeSnapshots;

  return {
    needsBrowser,
    wantsNativeSnapshots,
  };
}

export function resolveRuntimeFailingSteps(input: {
  wantsWrite: boolean;
  allowRuntimeDerivedApply: boolean;
  failedStepIndexes: number[];
  outputSteps: Step[];
  outputStepOriginalIndexes: number[];
  diagnostics: ImproveDiagnostic[];
  appliedBy: ImproveAppliedBy;
}): RuntimeFailureResolution {
  const failedIndexesToRemove = new Set<number>();
  const failedIndexesToRetain = new Set<number>();
  if (!input.wantsWrite) {
    return { failedIndexesToRemove, failedIndexesToRetain };
  }

  for (const index of input.failedStepIndexes) {
    const step = input.outputSteps[index];
    if (!step || step.action === "navigate") continue;

    const classification = classifyRuntimeFailingStep(step);
    const originalIndex = input.outputStepOriginalIndexes[index] ?? index;
    if (!input.allowRuntimeDerivedApply) {
      failedIndexesToRetain.add(index);
      input.diagnostics.push({
        code: "runtime_failing_step_removal_suppressed_by_determinism",
        level: "info",
        message:
          `Step ${originalIndex + 1}: retained after runtime failure because determinism guard requires report-only handling for runtime-derived removals.`,
        decisionConfidence: classification.decisionConfidence,
        mutationType: "runtime_step_retention",
        mutationSafety: "safe",
        evidenceRefs: ["determinism_guard"],
        appliedBy: input.appliedBy,
      });
      continue;
    }

    const safeToAutoRemove =
      classification.disposition === "remove" &&
      classification.mutationSafety === "safe" &&
      classification.decisionConfidence >= RUNTIME_STEP_REMOVE_MIN_CONFIDENCE;

    if (safeToAutoRemove) {
      failedIndexesToRemove.add(index);
      input.diagnostics.push({
        code: "runtime_failing_step_removed",
        level: "info",
        message:
          `Step ${originalIndex + 1}: removed because it failed at runtime (${classification.reason}).`,
        decisionConfidence: classification.decisionConfidence,
        mutationType: "runtime_step_removal",
        mutationSafety: classification.mutationSafety,
        evidenceRefs: classification.evidenceRefs,
        appliedBy: input.appliedBy,
      });
      continue;
    }

    failedIndexesToRetain.add(index);
    const safetySuffix =
      classification.disposition === "remove"
        ? " Auto-removal blocked by safety guard."
        : "";
    input.diagnostics.push({
      code: "runtime_failing_step_retained",
      level: "info",
      message:
        `Step ${originalIndex + 1}: retained as required step after runtime failure (${classification.reason}).${safetySuffix}`,
      decisionConfidence: classification.decisionConfidence,
      mutationType: "runtime_step_retention",
      mutationSafety: classification.mutationSafety,
      evidenceRefs: classification.evidenceRefs,
      appliedBy: input.appliedBy,
    });
  }

  return { failedIndexesToRemove, failedIndexesToRetain };
}

export function applyFailedStepRemovals(input: {
  wantsWrite: boolean;
  failedIndexesToRemove: Set<number>;
  outputSteps: Step[];
  outputStepOriginalIndexes: number[];
  nativeStepSnapshots: StepSnapshot[];
  findings: StepFinding[];
}): PostRemovalState {
  if (!input.wantsWrite || input.failedIndexesToRemove.size === 0) {
    return {
      outputSteps: input.outputSteps,
      outputStepOriginalIndexes: input.outputStepOriginalIndexes,
      nativeStepSnapshots: input.nativeStepSnapshots,
      findings: input.findings,
    };
  }

  const removedIndexes = [...input.failedIndexesToRemove];
  const sortedRemoveIndexes = [...removedIndexes].sort((a, b) => b - a);
  const outputSteps = [...input.outputSteps];
  for (const idx of sortedRemoveIndexes) {
    outputSteps.splice(idx, 1);
  }

  const outputStepOriginalIndexes = input.outputStepOriginalIndexes.filter(
    (_, index) => !input.failedIndexesToRemove.has(index)
  );

  const nativeStepSnapshots = input.nativeStepSnapshots
    .filter((snapshot) => !input.failedIndexesToRemove.has(snapshot.index))
    .map((snapshot) => {
      const offset = removedIndexes.filter((removed) => removed < snapshot.index).length;
      return { ...snapshot, index: snapshot.index - offset };
    });

  const removedOriginalIndexes = new Set(
    removedIndexes.map((index) => input.outputStepOriginalIndexes[index] ?? index)
  );
  const findings = input.findings.filter((finding) => !removedOriginalIndexes.has(finding.index));

  return {
    outputSteps,
    outputStepOriginalIndexes,
    nativeStepSnapshots,
    findings,
  };
}

export function resolveImproveDeterminismCapabilities(input: {
  baseUrl?: string;
  steps: Step[];
  observedUrls?: string[];
  suppressedMutationTypes?: ImproveMutationType[];
}): ImproveDeterminismCapabilities {
  const reasons = new Set<ImproveDeterminismReason>();
  const baseOrigin = normalizeOrigin(input.baseUrl);
  if (!baseOrigin) {
    reasons.add(DETERMINISM_REASON_CODES.missingBaseUrl);
  }

  if (baseOrigin) {
    for (const step of input.steps) {
      if (step.action !== "navigate") continue;
      const stepOrigin = normalizeOrigin(step.url);
      if (!stepOrigin) continue;
      if (stepOrigin !== baseOrigin) {
        reasons.add(DETERMINISM_REASON_CODES.replayHostMismatch);
        break;
      }
    }
  }

  const observedOrigins = [
    ...new Set((input.observedUrls ?? []).map((url) => normalizeOrigin(url)).filter(isDefined)),
  ];

  if (baseOrigin && observedOrigins.some((origin) => origin !== baseOrigin)) {
    reasons.add(DETERMINISM_REASON_CODES.crossOriginDrift);
  }

  const determinism: ImproveDeterminism = {
    status: reasons.size > 0 ? "unsafe" : "safe",
    reasons: [...reasons],
    ...(baseOrigin ? { baseOrigin } : {}),
    ...(observedOrigins.length > 0 ? { observedOrigins } : {}),
    ...(input.suppressedMutationTypes && input.suppressedMutationTypes.length > 0
      ? { suppressedMutationTypes: [...new Set(input.suppressedMutationTypes)] }
      : {}),
  };

  const allowRuntimeDerivedApply = determinism.status === "safe";

  return {
    allowRuntimeDerivedApply,
    allowRuntimeSelectorRepairApply: allowRuntimeDerivedApply,
    allowRuntimeAssertionApply: allowRuntimeDerivedApply,
    emitDeterminismDiagnostics: determinism.status === "unsafe",
    determinism,
  };
}

export function applyDeterminismGuardToSelectorPass(input: {
  selectorPass: {
    outputSteps: Step[];
    findings: StepFinding[];
    selectorRepairsApplied: number;
    selectorRepairsAdoptedOnTie: number;
    selectorRepairsAppliedFromPlaywrightRuntime: number;
  };
  initialOutputSteps: Step[];
  outputStepOriginalIndexes: number[];
  diagnostics: ImproveDiagnostic[];
  appliedBy: ImproveAppliedByReport;
}): {
  outputSteps: Step[];
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
  diagnostics: ImproveDiagnostic[];
  suppressedRuntimeSelectorRepairs: number;
} {
  const suppressedOriginalIndexes = new Set(
    input.selectorPass.findings
      .filter(
        (finding) =>
          finding.changed && finding.reasonCodes.includes("locator_repair_playwright_runtime")
      )
      .map((finding) => finding.index)
  );

  if (suppressedOriginalIndexes.size === 0) {
    return {
      outputSteps: input.selectorPass.outputSteps,
      selectorRepairsApplied: input.selectorPass.selectorRepairsApplied,
      selectorRepairsAdoptedOnTie: input.selectorPass.selectorRepairsAdoptedOnTie,
      selectorRepairsAppliedFromPlaywrightRuntime:
        input.selectorPass.selectorRepairsAppliedFromPlaywrightRuntime,
      diagnostics: input.diagnostics,
      suppressedRuntimeSelectorRepairs: 0,
    };
  }

  const originalToRuntimeIndex = new Map<number, number>();
  for (let runtimeIndex = 0; runtimeIndex < input.outputStepOriginalIndexes.length; runtimeIndex += 1) {
    const originalIndex = input.outputStepOriginalIndexes[runtimeIndex];
    if (originalIndex !== undefined) {
      originalToRuntimeIndex.set(originalIndex, runtimeIndex);
    }
  }

  const outputSteps = [...input.selectorPass.outputSteps];
  for (const originalIndex of suppressedOriginalIndexes) {
    const runtimeIndex = originalToRuntimeIndex.get(originalIndex);
    if (runtimeIndex === undefined) continue;
    const originalStep = input.initialOutputSteps[runtimeIndex];
    if (originalStep) {
      outputSteps[runtimeIndex] = originalStep;
    }
  }

  const filteredDiagnostics = input.diagnostics.filter((diagnostic) => {
    if (
      diagnostic.code !== "selector_repair_applied" &&
      diagnostic.code !== "selector_repair_adopted_on_tie_for_dynamic_target"
    ) {
      return true;
    }
    const stepIndex = extractDiagnosticStepIndex(diagnostic.message);
    return stepIndex === undefined ? true : !suppressedOriginalIndexes.has(stepIndex);
  });

  const suppressedTieDiagnostics = input.diagnostics.length - filteredDiagnostics.length;
  for (const originalIndex of [...suppressedOriginalIndexes].sort((left, right) => left - right)) {
    filteredDiagnostics.push({
      code: "selector_repair_apply_suppressed_by_determinism",
      level: "info",
      message:
        `Step ${originalIndex + 1}: kept selector repair recommendation report-only because determinism guard blocked runtime-derived auto-apply.`,
      mutationType: "selector_update",
      mutationSafety: "safe",
      evidenceRefs: ["determinism_guard"],
      appliedBy: input.appliedBy,
    });
  }

  const suppressedRuntimeSelectorRepairs = suppressedOriginalIndexes.size;

  return {
    outputSteps,
    selectorRepairsApplied: Math.max(
      0,
      input.selectorPass.selectorRepairsApplied - suppressedRuntimeSelectorRepairs
    ),
    selectorRepairsAdoptedOnTie: Math.max(
      0,
      input.selectorPass.selectorRepairsAdoptedOnTie - suppressedTieDiagnostics
    ),
    selectorRepairsAppliedFromPlaywrightRuntime: Math.max(
      0,
      input.selectorPass.selectorRepairsAppliedFromPlaywrightRuntime -
        suppressedRuntimeSelectorRepairs
    ),
    diagnostics: filteredDiagnostics,
    suppressedRuntimeSelectorRepairs,
  };
}

export function appendDeterminismDiagnostics(input: {
  diagnostics: ImproveDiagnostic[];
  determinism: ImproveDeterminism;
  appliedBy: ImproveAppliedByReport;
}): void {
  for (const reason of input.determinism.reasons) {
    switch (reason) {
      case DETERMINISM_REASON_CODES.missingBaseUrl:
        input.diagnostics.push({
          code: "determinism_missing_base_url",
          level: "warn",
          message:
            "Determinism guard marked this run unsafe because the test has no baseUrl; runtime-derived auto-apply remains report-only.",
          mutationType: "none",
          mutationSafety: "safe",
          evidenceRefs: ["determinism_guard"],
          appliedBy: input.appliedBy,
        });
        break;
      case DETERMINISM_REASON_CODES.replayHostMismatch:
        input.diagnostics.push({
          code: "determinism_replay_host_mismatch",
          level: "warn",
          message:
            "Determinism guard marked this run unsafe because replay targets a host outside the configured base origin.",
          mutationType: "none",
          mutationSafety: "safe",
          evidenceRefs: ["determinism_guard"],
          appliedBy: input.appliedBy,
        });
        break;
      case DETERMINISM_REASON_CODES.crossOriginDrift:
        input.diagnostics.push({
          code: "determinism_cross_origin_drift",
          level: "warn",
          message:
            "Determinism guard marked this run unsafe because runtime replay crossed origin relative to the configured base origin.",
          mutationType: "none",
          mutationSafety: "safe",
          evidenceRefs: ["determinism_guard"],
          appliedBy: input.appliedBy,
        });
        break;
    }
  }
}

export function appendDeterminismSuppressionDiagnostic(input: {
  diagnostics: ImproveDiagnostic[];
  mutationType: ImproveMutationType;
  appliedBy: ImproveAppliedByReport;
}): void {
  const detailByMutationType: Record<ImproveMutationType, string | undefined> = {
    selector_update:
      "Runtime-derived selector repairs remained report-only because determinism guard blocked auto-apply.",
    assertion_insert:
      "Runtime-derived assertion candidates remained report-only because determinism guard blocked auto-apply.",
    runtime_step_removal:
      "Runtime-failing step removals remained report-only because determinism guard blocked auto-apply.",
    runtime_step_retention: undefined,
    stale_assertion_removal: undefined,
    none: undefined,
  };

  const message = detailByMutationType[input.mutationType];
  if (!message) return;

  input.diagnostics.push({
    code: `determinism_${input.mutationType}_suppressed`,
    level: "info",
    message,
    mutationType: input.mutationType,
    mutationSafety: "safe",
    evidenceRefs: ["determinism_guard"],
    appliedBy: input.appliedBy,
  });
}

export function buildTestDocument(test: TestMetadata, steps: Step[]): TestDocument {
  return {
    name: test.name,
    ...(test.description !== undefined ? { description: test.description } : {}),
    ...(test.baseUrl !== undefined ? { baseUrl: test.baseUrl } : {}),
    steps,
  };
}

export function buildYamlOptionsFromTest(
  test: Pick<TestFile, "description" | "baseUrl">
): { description?: string; baseUrl?: string } {
  return {
    ...(test.description !== undefined ? { description: test.description } : {}),
    ...(test.baseUrl !== undefined ? { baseUrl: test.baseUrl } : {}),
  };
}

function normalizeOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function extractDiagnosticStepIndex(message: string): number | undefined {
  const match = /^Step\s+(\d+):/.exec(message);
  if (!match) return undefined;
  const raw = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(raw) || raw <= 0) return undefined;
  return raw - 1;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
