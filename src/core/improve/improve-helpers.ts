import path from "node:path";
import type { Target } from "../yaml-schema.js";
export {
  buildAssertionApplyStatusCounts,
  buildAssertionCandidateSourceCounts,
  buildOriginalToRuntimeIndex,
  buildOutputStepOriginalIndexes,
  chooseDeterministicSelection,
  dedupeAssertionCandidates,
} from "./improve-helpers-support.js";
import { roundScore } from "./score-math.js";

export function isFallbackTarget(target: Target): boolean {
  return (
    target.kind === "css" ||
    target.kind === "xpath" ||
    target.kind === "internal" ||
    target.kind === "unknown"
  );
}

export function defaultReportPath(testPath: string): string {
  const ext = path.extname(testPath);
  const base = ext ? testPath.slice(0, -ext.length) : testPath;
  return `${base}.improve-report.json`;
}

export { roundScore };
