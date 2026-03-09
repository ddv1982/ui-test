import fs from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import { record as runRecording, normalizeFirstNavigate, slugify, type RecordOptions } from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { PLAY_DEFAULT_BASE_URL, PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import {
  resolveRecordProfile,
  parseRecordImproveMode,
  type RecordImproveMode,
  hasUrlProtocol,
  normalizeRecordUrl,
} from "../options/record-profile.js";
import { formatRecordingProfileSummary } from "../options/profile-summary.js";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";
import { defaultRunInteractiveCommand } from "../../infra/process/process-runner-adapter.js";
import { devtoolsRecordingToSteps } from "../../core/transform/devtools-recording-adapter.js";
import { stepsToYaml } from "../../core/transform/yaml-io.js";
import {
  canonicalEventsToSteps,
  stepsToCanonicalEvents,
} from "../../core/recording/canonical-events.js";

export interface RecordCliOptions {
  name?: string;
  url?: string;
  description?: string;
  outputDir?: string;
  browser?: string;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
  fromFile?: string;
  improveMode?: string;
  improve?: boolean;
}

export async function runRecord(opts: RecordCliOptions): Promise<void> {
  if (opts.fromFile) {
    await runRecordFromFile(opts);
    return;
  }

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

  const profileInput = { ...opts, outputDir };
  const profile = resolveRecordProfile(profileInput);

  if (profile.browser === "chromium") {
    await ensureChromiumAvailable();
  }

  const summaryOptions: {
    browser: typeof profile.browser;
    improveMode: RecordImproveMode;
    device?: string;
    testIdAttribute?: string;
    loadStorage?: string;
    saveStorage?: string;
  } = {
    browser: profile.browser,
    improveMode: profile.improveMode,
  };
  if (profile.device !== undefined) summaryOptions.device = profile.device;
  if (profile.testIdAttribute !== undefined) {
    summaryOptions.testIdAttribute = profile.testIdAttribute;
  }
  if (profile.loadStorage !== undefined) summaryOptions.loadStorage = profile.loadStorage;
  if (profile.saveStorage !== undefined) summaryOptions.saveStorage = profile.saveStorage;
  ui.info(formatRecordingProfileSummary(summaryOptions));

  const recordingOptions: RecordOptions = {
    name,
    url,
    outputDir: profile.outputDir,
    browser: profile.browser,
  };
  const cleanedDescription = description || undefined;
  if (cleanedDescription !== undefined) {
    recordingOptions.description = cleanedDescription;
  }
  if (profile.device !== undefined) recordingOptions.device = profile.device;
  if (profile.testIdAttribute !== undefined) {
    recordingOptions.testIdAttribute = profile.testIdAttribute;
  }
  if (profile.loadStorage !== undefined) {
    recordingOptions.loadStorage = profile.loadStorage;
  }
  if (profile.saveStorage !== undefined) {
    recordingOptions.saveStorage = profile.saveStorage;
  }
  const result = await runRecording(recordingOptions, {
    runInteractiveCommand: defaultRunInteractiveCommand,
  });

  console.log();
  ui.success(`Test saved to ${result.outputPath}`);
  ui.info(`Recording mode: ${result.recordingMode} (${result.stepCount} steps)`);
  ui.info("Run it with: ui-test play " + result.outputPath);

  if (opts.improve !== false) {
    try {
      await runAutoImprove(result.outputPath, profile.improveMode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ui.warn("Auto-improve failed: " + message);
      ui.warn(
        "You can run it manually: " +
          buildManualImproveCommand(result.outputPath, profile.improveMode)
      );
    }
  }
}

async function runRecordFromFile(opts: RecordCliOptions): Promise<void> {
  const filePath = opts.fromFile!;
  const improveMode = parseRecordImproveMode(opts.improveMode) ?? "apply";

  let json: string;
  try {
    json = await fs.readFile(filePath, "utf-8");
  } catch {
    throw new UserError(
      `Could not read file: ${filePath}`,
      "Make sure the file exists and is a Chrome DevTools Recorder JSON export."
    );
  }

  const result = devtoolsRecordingToSteps(json);
  if (result.steps.length === 0) {
    throw new UserError(
      "No supported interactions found in the DevTools recording.",
      "Make sure the file is a valid Chrome DevTools Recorder JSON export with click, type, or navigation steps."
    );
  }

  const name =
    opts.name ??
    result.title ??
    path.basename(filePath, path.extname(filePath));

  const outputDir = opts.outputDir ?? PLAY_DEFAULT_TEST_DIR;

  const slug = slugify(name) || `test-${Date.now()}`;
  const outputPath = path.join(outputDir, `${slug}.yaml`);

  const firstStep = result.steps[0];
  const firstNavigateUrl =
    firstStep?.action === "navigate" ? firstStep.url : undefined;
  const steps = firstNavigateUrl
    ? normalizeFirstNavigate(result.steps, firstNavigateUrl)
    : result.steps;
  const canonicalizedSteps = canonicalEventsToSteps(stepsToCanonicalEvents(steps));

  const yamlOptions: { description?: string; baseUrl?: string } = {};
  if (opts.description) yamlOptions.description = opts.description;
  if (firstNavigateUrl) {
    try {
      const parsed = new URL(firstNavigateUrl);
      yamlOptions.baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      // ignore invalid URLs
    }
  }

  const yamlContent = stepsToYaml(name, canonicalizedSteps, yamlOptions);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, yamlContent, "utf-8");

  console.log();
  ui.success(`Test saved to ${outputPath}`);
  ui.info(
    `Imported ${canonicalizedSteps.length} steps from DevTools recording (${result.skipped} skipped)`
  );
  ui.info("Run it with: ui-test play " + outputPath);

  if (opts.improve !== false) {
    try {
      await runAutoImprove(outputPath, improveMode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ui.warn("Auto-improve failed: " + message);
      ui.warn(
        "You can run it manually: " +
          buildManualImproveCommand(outputPath, improveMode)
      );
    }
  }
}

async function runAutoImprove(
  testFile: string,
  improveMode: RecordImproveMode
): Promise<void> {
  if (improveMode === "off") {
    return;
  }

  const applyMutations = improveMode === "apply";
  const appliedBy = applyMutations ? "auto_apply" : "report_only";

  console.log();
  ui.info(`Running auto-improve (${improveMode})...`);
  const improveResult = await improveTestFile({
    testFile,
    ...(applyMutations ? { outputPath: resolveDefaultImproveOutputPath(testFile) } : {}),
    applySelectors: applyMutations,
    applyAssertions: applyMutations,
    assertions: "candidates",
    assertionPolicy: "reliable",
    appliedBy,
  });

  const summary = improveResult.report.summary;
  if (!applyMutations) {
    const parts: string[] = [];
    if (summary.improved > 0) {
      parts.push(summary.improved + " selector recommendations");
    }
    if (summary.assertionCandidates > 0) {
      parts.push(summary.assertionCandidates + " assertion candidates");
    }
    if ((summary.assertionCandidatesFilteredDynamic ?? 0) > 0) {
      parts.push(
        (summary.assertionCandidatesFilteredDynamic ?? 0) +
          " dynamic assertion candidates filtered"
      );
    }

    if (parts.length > 0) {
      ui.info("Auto-improve report: " + parts.join(", "));
    } else {
      ui.info("Auto-improve report: no recommendations");
    }
    ui.step("Apply recommendations: ui-test improve " + path.resolve(testFile) + " --apply");
    return;
  }

  const removedSteps = improveResult.report.diagnostics.filter(
    (d) => d.code === "runtime_failing_step_removed"
  ).length;
  const retainedStepDiagnostics = improveResult.report.diagnostics.filter(
    (d) => d.code === "runtime_failing_step_retained"
  ).length;
  const retainedSteps =
    summary.runtimeFailingStepsRetained ??
    retainedStepDiagnostics;

  const parts: string[] = [];
  if (summary.improved > 0) parts.push(summary.improved + " selectors improved");
  if ((summary.selectorRepairsApplied ?? 0) > 0) {
    parts.push((summary.selectorRepairsApplied ?? 0) + " selector repairs applied");
  }
  if (summary.appliedAssertions > 0) parts.push(summary.appliedAssertions + " assertions applied");
  if ((summary.assertionCandidatesFilteredDynamic ?? 0) > 0) {
    parts.push(
      (summary.assertionCandidatesFilteredDynamic ?? 0) +
        " dynamic assertion candidates filtered"
    );
  }
  if (retainedSteps > 0) parts.push(retainedSteps + " failing steps retained");
  if (removedSteps > 0) parts.push(removedSteps + " transient steps removed");

  if (parts.length > 0) {
    ui.success("Auto-improve: " + parts.join(", "));
  } else {
    ui.info("Auto-improve: no changes needed");
  }

  if (improveResult.outputPath) {
    ui.step("Run improved test with: ui-test play " + improveResult.outputPath);
  }
}

function resolveDefaultImproveOutputPath(testFile: string): string {
  const ext = path.extname(testFile);
  const base = ext ? testFile.slice(0, -ext.length) : testFile;
  const effectiveExt = ext.length > 0 ? ext : ".yaml";
  return `${base}.improved${effectiveExt}`;
}

function buildManualImproveCommand(
  testFile: string,
  improveMode: RecordImproveMode
): string {
  const absolutePath = path.resolve(testFile);
  if (improveMode === "apply") {
    const planPath = absolutePath.replace(/(\.[^.]+)?$/, ".improve-plan.json");
    return `ui-test improve ${absolutePath} --plan && ui-test improve ${absolutePath} --apply-plan ${planPath}`;
  }
  return `ui-test improve ${absolutePath} --no-apply`;
}
