import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
  AssertionCandidateSource,
} from "../core/improve/report-schema.js";

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
  const localEntrypoint = path.join(resolvedCwd, "dist", "bin", "ui-test.js");
  const resolvedTestFile = path.isAbsolute(testFile)
    ? testFile
    : path.resolve(resolvedCwd, testFile);

  const resolvedArgv = resolveInvocationPath(argv1, resolvedCwd);
  if (!resolvedArgv) {
    if (!argv1) return undefined;
    return `Could not verify ui-test binary path from invocation (${argv1}). Behavior may differ from local source. Run local build for consistency: node ${localEntrypoint} improve ${resolvedTestFile}`;
  }

  if (isPathInside(resolvedArgv, resolvedCwd)) return undefined;

  return `ui-test binary path (${resolvedArgv}) is outside this workspace (${resolvedCwd}). Behavior may differ from local source. Run local build for consistency: node ${localEntrypoint} improve ${resolvedTestFile}`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isPathInside(targetPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  if (relative === "") return true;
  if (relative === "..") return false;
  if (relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
}

function resolveInvocationPath(argv1: string | undefined, cwd: string): string | undefined {
  if (!argv1) return undefined;

  if (argv1.startsWith("file://")) {
    try {
      return path.resolve(fileURLToPath(argv1));
    } catch {
      return undefined;
    }
  }

  if (path.isAbsolute(argv1)) {
    return path.resolve(argv1);
  }

  // Relative script paths (for example: ./dist/bin/ui-test.js or dist/bin/ui-test.js)
  if (
    argv1.includes(path.sep) ||
    argv1.includes("/") ||
    argv1.includes("\\")
  ) {
    return path.resolve(cwd, argv1);
  }

  // Bare command token (for example: ui-test) cannot be verified reliably.
  return undefined;
}
