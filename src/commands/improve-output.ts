import path from "node:path";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
  AssertionCandidateSource,
} from "../core/improve/report-schema.js";
import {
  classifyInvocationPath,
  resolveLocalUiTestPackageRoot,
  resolveWorkspaceRoot,
} from "../utils/runtime-info.js";

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
  "snapshot_cli",
];

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
    : `npx -y github:ddv1982/easy-e2e-testing improve ${resolvedTestFile}`;

  const invocation = classifyInvocationPath(workspaceRoot, argv1);
  if (invocation.classification === "inside-workspace") return undefined;

  if (invocation.classification === "unverifiable") {
    if (!argv1) return undefined;
    return `Could not verify ui-test binary path from invocation (${argv1}). Behavior may differ from local source. Re-run with: ${recommendedCommand}`;
  }

  return `ui-test binary path (${invocation.resolvedInvocationPath ?? argv1}) is outside this workspace (${workspaceRoot}). Behavior may differ from local source. Re-run with: ${recommendedCommand}`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
