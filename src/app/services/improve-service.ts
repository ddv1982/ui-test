import path from "node:path";
import { improveTestFile } from "../../core/improve/improve.js";
import { resolveImproveProfile } from "../options/improve-profile.js";
import { formatImproveProfileSummary } from "../options/profile-summary.js";
import { ui } from "../../utils/ui.js";
import {
  buildExternalCliInvocationWarning,
  collectAssertionSkipDetails,
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "./improve-output.js";

export interface ImproveCliOptions {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  report?: string;
}

export async function runImprove(
  testFile: string,
  opts: ImproveCliOptions
): Promise<void> {
  const invocationWarning = buildExternalCliInvocationWarning(
    process.cwd(),
    process.argv[1],
    testFile
  );
  if (invocationWarning) {
    ui.warn(invocationWarning);
  }

  const profile = resolveImproveProfile(opts);

  ui.info(
    formatImproveProfileSummary({
      applySelectors: profile.applySelectors,
      applyAssertions: profile.applyAssertions,
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
    })
  );

  const result = await improveTestFile({
    testFile,
    applySelectors: profile.applySelectors,
    applyAssertions: profile.applyAssertions,
    assertions: profile.assertions,
    assertionSource: profile.assertionSource,
    reportPath: profile.reportPath,
  });

  ui.success(`Improve report saved to ${result.reportPath}`);
  if (result.outputPath) {
    ui.success(`Applied improvements to ${result.outputPath}`);
  }

  ui.info(
    `Summary: improved=${result.report.summary.improved}, unchanged=${result.report.summary.unchanged}, fallback=${result.report.summary.fallback}, warnings=${result.report.summary.warnings}, assertionCandidates=${result.report.summary.assertionCandidates}, appliedAssertions=${result.report.summary.appliedAssertions}, skippedAssertions=${result.report.summary.skippedAssertions}`
  );
  const assertionStatusSummary = formatAssertionApplyStatusCounts(result.report.assertionCandidates);
  if (assertionStatusSummary) {
    ui.info(`Assertion apply status: ${assertionStatusSummary}`);
  }
  const assertionSourceSummary = formatAssertionSourceCounts(result.report.assertionCandidates);
  if (assertionSourceSummary) {
    ui.info(`Assertion sources: ${assertionSourceSummary}`);
  }
  const skippedDetails = collectAssertionSkipDetails(result.report.assertionCandidates, 3);
  for (const detail of skippedDetails.details) {
    ui.step(`Skip detail: ${detail}`);
  }
  if (skippedDetails.remaining > 0) {
    ui.step(`... ${skippedDetails.remaining} more skipped assertion candidate(s) in report`);
  }

  ui.step(`Review report: ${result.reportPath}`);
  if (!result.outputPath) {
    ui.step(`Apply all improvements: ui-test improve ${path.resolve(testFile)} --apply`);
  }
  if (!profile.applySelectors && !profile.applyAssertions && profile.assertions === "candidates") {
    ui.step("Or apply improvements: --apply");
  }
}
