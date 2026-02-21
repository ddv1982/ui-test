import type { TestResult } from "../../core/play/play-types.js";
import type { PlayRunReport } from "../../core/play-failure-report.js";

export interface PlayRunSummary {
  passed: number;
  failed: number;
  totalMs: number;
}

export function summarizePlayResults(results: TestResult[]): PlayRunSummary {
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    totalMs: results.reduce((sum, result) => sum + result.durationMs, 0),
  };
}

export function buildFailedTestsReport(
  results: TestResult[]
): {
  failedTests: PlayRunReport["failedTests"];
  firstTracePath?: string;
} {
  let firstTracePath: string | undefined;
  const failedTests: PlayRunReport["failedTests"] = results
    .filter((result) => !result.passed)
    .map((result) => {
      const failedStep = result.steps.find((step) => !step.passed);
      if (!firstTracePath && result.failureArtifacts?.tracePath) {
        firstTracePath = result.failureArtifacts.tracePath;
      }
      return {
        name: result.name,
        file: result.file,
        slug: result.failureArtifacts?.testSlug ?? "unknown",
        failure: {
          stepIndex: failedStep?.index ?? 0,
          action: failedStep?.step.action ?? "unknown",
          error: failedStep?.error ?? "Unknown failure",
        },
        artifacts: {
          reportPath: result.failureArtifacts?.reportPath,
          tracePath: result.failureArtifacts?.tracePath,
          screenshotPath: result.failureArtifacts?.screenshotPath,
        },
        warnings: result.artifactWarnings ?? [],
      };
    });

  return firstTracePath === undefined
    ? { failedTests }
    : { failedTests, firstTracePath };
}
