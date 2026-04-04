import path from "node:path";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
  AssertionCandidateSource,
  ImproveDeterminism,
  ImproveDeterminismReason,
  ImproveMutationType,
} from "../../core/improve/report-schema.js";
import {
  buildRecommendedCliCommand,
  classifyInvocationPath,
  resolveLocalUiTestPackageRoot,
  resolveWorkspaceRoot,
} from "../../utils/runtime-info.js";

const ASSERTION_APPLY_STATUS_ORDER: AssertionApplyStatus[] = [
  "applied",
  "skipped_policy",
  "skipped_runtime_failure",
  "skipped_existing",
  "skipped_low_confidence",
  "not_requested",
];

const ASSERTION_SOURCE_ORDER: AssertionCandidateSource[] = [
  "deterministic",
  "snapshot_native",
];

const DETERMINISM_REASON_LABELS: Record<ImproveDeterminismReason, string> = {
  missing_base_url: "missing baseUrl",
  replay_host_mismatch: "host mismatch",
  cross_origin_drift: "cross-origin drift",
};

const SUPPRESSED_MUTATION_LABELS: Record<ImproveMutationType, string | undefined> = {
  selector_update: "runtime selector apply blocked",
  assertion_insert: "runtime assertion apply blocked",
  runtime_step_removal: "runtime removals blocked",
  runtime_step_retention: undefined,
  stale_assertion_removal: undefined,
  none: undefined,
};

export function formatAssertionApplyStatusCounts(candidates: AssertionCandidate[]): string | undefined {
  const counts = new Map<AssertionApplyStatus, number>();
  for (const candidate of candidates) {
    if (!candidate.applyStatus) continue;
    counts.set(candidate.applyStatus, (counts.get(candidate.applyStatus) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;

  const parts = ASSERTION_APPLY_STATUS_ORDER
    .map((status) => {
      const count = counts.get(status);
      return count ? `${status}=${count}` : undefined;
    })
    .filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function formatAssertionSourceCounts(candidates: AssertionCandidate[]): string | undefined {
  const counts = new Map<AssertionCandidateSource, number>();
  for (const candidate of candidates) {
    if (!candidate.candidateSource) continue;
    counts.set(candidate.candidateSource, (counts.get(candidate.candidateSource) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;

  const parts = ASSERTION_SOURCE_ORDER
    .map((source) => {
      const count = counts.get(source);
      return count ? `${source}=${count}` : undefined;
    })
    .filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function collectAssertionSkipDetails(
  candidates: AssertionCandidate[],
  limit: number
): { details: string[]; remaining: number } {
  const skipped = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => {
      if (!candidate.applyStatus) return false;
      return candidate.applyStatus !== "applied" && candidate.applyStatus !== "not_requested";
    });

  const details = skipped.slice(0, limit).map(({ candidate, index }) => {
    const message = collapseWhitespace(candidate.applyMessage ?? "").slice(0, 160);
    const sourceStep = candidate.index + 1;
    const suffix = message.length > 0 ? `: ${message}` : "";
    return `candidate ${index + 1} (step ${sourceStep}) ${candidate.applyStatus}${suffix}`;
  });

  return {
    details,
    remaining: Math.max(0, skipped.length - details.length),
  };
}

export function buildExternalCliInvocationWarning(
  cwd: string,
  argv1: string | undefined,
  testFile: string
): string | undefined {
  const resolvedCwd = path.resolve(cwd);
  const workspaceRoot = resolveWorkspaceRoot(resolvedCwd);
  const localPackageRoot = resolveLocalUiTestPackageRoot(resolvedCwd);
  const localEntrypoint = localPackageRoot
    ? path.join(localPackageRoot, "dist", "bin", "ui-test.js")
    : undefined;
  const resolvedTestFile = path.isAbsolute(testFile)
    ? testFile
    : path.resolve(resolvedCwd, testFile);
  const recommendedCommand = localEntrypoint
    ? `node ${localEntrypoint} improve ${resolvedTestFile}`
    : buildRecommendedCliCommand(["improve", resolvedTestFile], resolvedCwd, argv1);

  const invocation = classifyInvocationPath(workspaceRoot, argv1);
  if (invocation.classification === "inside-workspace") return undefined;

  if (invocation.classification === "unverifiable") {
    if (!argv1) return undefined;
    return `Could not verify ui-test binary path from invocation (${argv1}). Behavior may differ from local source. Re-run with: ${recommendedCommand}`;
  }

  return `ui-test binary path (${invocation.resolvedInvocationPath ?? argv1}) is outside this workspace (${workspaceRoot}). Behavior may differ from local source. Re-run with: ${recommendedCommand}`;
}

export function formatDeterminismVerdict(
  determinism: ImproveDeterminism | undefined
): { level: "info" | "warn"; message: string } | undefined {
  if (!determinism) return undefined;
  return buildDeterminismVerdict("Determinism", determinism);
}

export function formatDeterminismVerdictWithPrefix(
  prefix: string,
  determinism: ImproveDeterminism | undefined
): { level: "info" | "warn"; message: string } | undefined {
  if (!determinism) return undefined;
  return buildDeterminismVerdict(prefix, determinism);
}

function buildDeterminismVerdict(
  prefix: string,
  determinism: ImproveDeterminism
): { level: "info" | "warn"; message: string } {
  if (determinism.status === "safe") {
    return {
      level: "info",
      message: `${prefix}: safe — runtime-derived auto-apply allowed.`,
    };
  }

  const reasons = determinism.reasons.map((reason) => DETERMINISM_REASON_LABELS[reason]);
  const suppressed = (determinism.suppressedMutationTypes ?? [])
    .map((mutationType) => SUPPRESSED_MUTATION_LABELS[mutationType])
    .filter((label): label is string => label !== undefined);

  const parts = [`Determinism: unsafe (${reasons.join(", ")})`];
  parts[0] = `${prefix}: unsafe (${reasons.join(", ")})`;
  if (suppressed.length > 0) {
    parts.push(`${suppressed.join(", ")}; recommendations kept report-only`);
  } else {
    parts.push("runtime-derived recommendations kept report-only");
  }

  return {
    level: "warn",
    message: parts.join(" — "),
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
