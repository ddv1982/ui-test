import type { Command } from "commander";
import path from "node:path";
import { improveTestFile } from "../core/improve/improve.js";
import { loadConfig } from "../utils/config.js";
import { handleError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";
import {
  resolveImproveProfile,
} from "../app/options/improve-profile.js";
import { formatImproveProfileSummary } from "../app/options/profile-summary.js";
import {
  buildExternalCliInvocationWarning,
  collectAssertionSkipDetails,
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "./improve-output.js";

export function registerImprove(program: Command) {
  program
    .command("improve")
    .description("Analyze and improve recorded selectors")
    .argument("<test-file>", "Path to the YAML test file to analyze")
    .option("--apply", "Apply all improvements (selectors and assertions)")
    .option("--no-apply", "Force review mode and do not write any changes")
    .option("--apply-selectors", "Apply selector improvements only")
    .option("--no-apply-selectors", "Do not apply selector improvements")
    .option("--apply-assertions", "Apply high-confidence assertion candidates to the YAML file")
    .option("--no-apply-assertions", "Do not apply assertion candidates for this run")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic, snapshot-cli, or snapshot-native"
    )
    .option("--report <path>", "Write JSON report to a custom path")
    .action(async (testFile, opts) => {
      try {
        await runImprove(testFile, opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runImprove(
  testFile: string,
  opts: {
    apply?: boolean;
    applySelectors?: boolean;
    applyAssertions?: boolean;
    assertions?: string;
    assertionSource?: string;
    report?: string;
  }
): Promise<void> {
  const invocationWarning = buildExternalCliInvocationWarning(
    process.cwd(),
    process.argv[1],
    testFile
  );
  if (invocationWarning) {
    ui.warn(invocationWarning);
  }

  const config = await loadConfig();
  const profile = resolveImproveProfile(opts, config);

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
    ui.step(`Apply all improvements: npx ui-test improve ${path.resolve(testFile)} --apply`);
  }
  if (!profile.applySelectors && !profile.applyAssertions && profile.assertions === "candidates") {
    ui.step(`Or apply selectively: --apply-selectors, --apply-assertions`);
  }
}
