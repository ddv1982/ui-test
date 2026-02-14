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

export function registerImprove(program: Command) {
  program
    .command("improve")
    .description("Analyze and improve recorded selectors")
    .argument("<test-file>", "Path to the YAML test file to analyze")
    .option("--apply", "Apply approved selector improvements to the YAML file")
    .option("--no-apply", "Force review mode and do not write YAML changes")
    .option("--apply-assertions", "Apply high-confidence assertion candidates to the YAML file")
    .option("--no-apply-assertions", "Do not apply assertion candidates for this run")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic or snapshot-cli"
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
    applyAssertions?: boolean;
    assertions?: string;
    assertionSource?: string;
    report?: string;
  }
): Promise<void> {
  const config = await loadConfig();
  const profile = resolveImproveProfile(opts, config);

  ui.info(
    formatImproveProfileSummary({
      apply: profile.apply,
      applyAssertions: profile.applyAssertions,
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
    })
  );

  const result = await improveTestFile({
    testFile,
    apply: profile.apply,
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

  ui.step(`Review report: ${result.reportPath}`);
  if (!result.outputPath) {
    ui.step(`Apply approved changes: npx ui-test improve ${path.resolve(testFile)} --apply`);
  }
  if (!profile.applyAssertions && profile.assertions === "candidates") {
    ui.step(`Apply assertion candidates: npx ui-test improve ${path.resolve(testFile)} --apply-assertions`);
  }
}
