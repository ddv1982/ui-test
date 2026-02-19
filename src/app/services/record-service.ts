import { input } from "@inquirer/prompts";
import { record as runRecording } from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { PLAY_DEFAULT_BASE_URL, PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { resolveRecordProfile, hasUrlProtocol, normalizeRecordUrl } from "../options/record-profile.js";
import { formatRecordingProfileSummary } from "../options/profile-summary.js";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";

export interface RecordCliOptions {
  name?: string;
  url?: string;
  description?: string;
  outputDir?: string;
  selectorPolicy?: string;
  browser?: string;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
  improve?: boolean;
}

export async function runRecord(opts: RecordCliOptions): Promise<void> {
  const name =
    opts.name ??
    (await input({
      message: "Test name:",
      validate: (v) => (v.trim().length > 0 ? true : "Name is required"),
    }));

  const rawUrl =
    opts.url ??
    (await input({
      message: "Starting URL:",
      default: PLAY_DEFAULT_BASE_URL,
      validate: (value) => {
        try {
          normalizeRecordUrl(value);
          return true;
        } catch (err) {
          if (err instanceof UserError && err.hint) {
            return `${err.message} ${err.hint}`;
          }
          return err instanceof Error ? err.message : "Invalid URL";
        }
      },
    }));

  const url = normalizeRecordUrl(rawUrl);
  if (rawUrl.trim() !== url.trim() && !hasUrlProtocol(rawUrl.trim())) {
    ui.info(`No protocol provided; using ${url}`);
  }

  const description =
    opts.description ??
    (await input({
      message: "Description (optional):",
    }));

  const outputDir =
    opts.outputDir ??
    (await input({
      message: "Output directory:",
      default: PLAY_DEFAULT_TEST_DIR,
    }));

  const profile = resolveRecordProfile({ ...opts, outputDir });

  if (profile.browser === "chromium") {
    await ensureChromiumAvailable();
  }

  ui.info(
    formatRecordingProfileSummary({
      browser: profile.browser,
      selectorPolicy: profile.selectorPolicy,
      device: profile.device,
      testIdAttribute: profile.testIdAttribute,
      loadStorage: profile.loadStorage,
      saveStorage: profile.saveStorage,
    })
  );

  const result = await runRecording({
    name,
    url,
    description: description || undefined,
    outputDir: profile.outputDir,
    selectorPolicy: profile.selectorPolicy,
    browser: profile.browser,
    device: profile.device,
    testIdAttribute: profile.testIdAttribute,
    loadStorage: profile.loadStorage,
    saveStorage: profile.saveStorage,
  });

  console.log();
  ui.success(`Test saved to ${result.outputPath}`);
  ui.info(
    `Recording mode: ${result.recordingMode}${result.degraded ? " (degraded fidelity)" : ""}`
  );
  ui.info(
    `Selector quality: stable=${result.stats.stableSelectors}, fallback=${result.stats.fallbackSelectors}, frame-aware=${result.stats.frameAwareSelectors}`
  );
  ui.info("Run it with: ui-test play " + result.outputPath);

  if (opts.improve !== false) {
    try {
      console.log();
      ui.info("Running auto-improve...");
      const improveResult = await improveTestFile({
        testFile: result.outputPath,
        applySelectors: true,
        applyAssertions: true,
        assertions: "candidates",
      });

      const summary = improveResult.report.summary;
      const removedSteps = improveResult.report.diagnostics.filter(
        (d) => d.code === "runtime_failing_step_removed"
      ).length;
      const optionalizedSteps = improveResult.report.diagnostics.filter(
        (d) => d.code === "runtime_failing_step_marked_optional"
      ).length;

      const parts: string[] = [];
      if (summary.improved > 0) parts.push(summary.improved + " selectors improved");
      if ((summary.selectorRepairsApplied ?? 0) > 0) {
        parts.push((summary.selectorRepairsApplied ?? 0) + " selector repairs applied");
      }
      if (summary.appliedAssertions > 0) parts.push(summary.appliedAssertions + " assertions applied");
      if ((summary.assertionCandidatesFilteredVolatile ?? 0) > 0) {
        parts.push(
          (summary.assertionCandidatesFilteredVolatile ?? 0) +
            " volatile assertion candidates filtered"
        );
      }
      if (optionalizedSteps > 0) parts.push(optionalizedSteps + " failing steps optionalized");
      if (removedSteps > 0) parts.push(removedSteps + " transient steps removed");

      if (parts.length > 0) {
        ui.success("Auto-improve: " + parts.join(", "));
      } else {
        ui.info("Auto-improve: no changes needed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ui.warn("Auto-improve failed: " + message);
      ui.warn("You can run it manually: ui-test improve " + result.outputPath + " --apply");
    }
  }
}
