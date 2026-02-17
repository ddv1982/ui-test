import type { ImproveReport } from "./report-schema.js";

export type ImproveAssertionsMode = "none" | "candidates";
export type ImproveAssertionSource = "deterministic" | "snapshot-native";

export interface ImproveOptions {
  testFile: string;
  applySelectors: boolean;
  applyAssertions: boolean;
  assertions: ImproveAssertionsMode;
  assertionSource?: ImproveAssertionSource;
  reportPath?: string;
}

export interface ImproveResult {
  report: ImproveReport;
  reportPath: string;
  outputPath?: string;
}

export const DEFAULT_RUNTIME_TIMEOUT_MS = 3_000;
export const DEFAULT_SCORING_TIMEOUT_MS = 1_200;
export const ASSERTION_APPLY_MIN_CONFIDENCE = 0.75;
