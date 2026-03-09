import type { ImproveReport } from "./report-schema.js";
import type { Step } from "../yaml-schema.js";

export type ImproveAssertionsMode = "none" | "candidates";
export type ImproveAssertionSource = "deterministic" | "snapshot-native";
export type ImproveAssertionPolicy = "reliable" | "balanced" | "aggressive";
export type ImproveAppliedBy =
  | "auto_apply"
  | "manual_apply"
  | "plan_apply"
  | "plan_preview"
  | "report_only";

export interface ImproveOptions {
  testFile: string;
  /**
   * Optional output path for apply-mode writes. When omitted, apply-mode writes
   * update the input test file in place.
   */
  outputPath?: string;
  applySelectors: boolean;
  applyAssertions: boolean;
  assertions: ImproveAssertionsMode;
  assertionSource?: ImproveAssertionSource;
  assertionPolicy?: ImproveAssertionPolicy;
  reportPath?: string;
  dryRunWrite?: boolean;
  includeProposedTest?: boolean;
  appliedBy?: ImproveAppliedBy;
}

export interface ImproveProposedTest {
  name: string;
  description?: string;
  baseUrl?: string;
  steps: Step[];
}

export interface ImproveResult {
  report: ImproveReport;
  reportPath: string;
  outputPath?: string;
  proposedTest?: ImproveProposedTest;
}

export const DEFAULT_RUNTIME_TIMEOUT_MS = 3_000;
export const DEFAULT_SCORING_TIMEOUT_MS = 1_200;
export const ASSERTION_APPLY_MIN_CONFIDENCE = 0.75;
export const RUNTIME_STEP_REMOVE_MIN_CONFIDENCE = 0.85;
