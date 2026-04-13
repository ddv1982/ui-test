import path from "node:path";
import { confirm, input } from "@inquirer/prompts";
import {
  record as runRecording,
  RECORDER_NO_INTERACTIONS_ERROR_CODE,
  type RecordOptions,
} from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { PLAY_DEFAULT_BASE_URL, PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { saveRecordedYaml } from "../../core/recording/recording-output.js";
import { classifySelector } from "../../core/selector-classifier.js";
import {
  resolveRecordProfile,
  type RecordImproveMode,
  hasUrlProtocol,
  normalizeRecordUrl,
} from "../options/record-profile.js";
import {
  resolveImproveProfile,
  type ImproveProfileInput,
  type ResolvedImproveProfile,
} from "../options/improve-profile.js";
import { formatRecordingProfileSummary } from "../options/profile-summary.js";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";
import { defaultRunInteractiveCommand } from "../../infra/process/process-runner-adapter.js";
import { importRecordFromFile } from "./record-devtools-import.js";
import { formatDeterminismVerdict } from "./improve-output.js";
import { pickLocatorInteractively } from "./record-pick-locator.js";
import type { Step, Target } from "../../core/yaml-schema.js";

function resolveRecordAutoImproveProfile(improveMode: RecordImproveMode): ResolvedImproveProfile {
  const improveProfileInput: ImproveProfileInput = {
    apply: improveMode === "apply",
    assertions: "candidates",
    assertionSource: "deterministic",
    assertionPolicy: "reliable",
  };
  return resolveImproveProfile(improveProfileInput);
}

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
    const imported = await importRecordFromFile(opts);
    if (opts.improve !== false) {
      try {
        await runAutoImprove(imported.outputPath, imported.improveMode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ui.warn("Auto-improve failed: " + message);
        ui.warn(
          "You can run it manually: " +
            buildManualImproveCommand(imported.outputPath, imported.improveMode)
        );
      }
    }
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
  let result;
  try {
    result = await runRecording(recordingOptions, {
      runInteractiveCommand: defaultRunInteractiveCommand,
    });
  } catch (err) {
    if (isNoInteractionsError(err)) {
      const fallback =
        (await maybeCreateInteractivePickFallback({
          name,
          url,
          outputDir: profile.outputDir,
          browser: profile.browser,
          ...(profile.device !== undefined ? { device: profile.device } : {}),
          ...(profile.testIdAttribute !== undefined
            ? { testIdAttribute: profile.testIdAttribute }
            : {}),
          ...(profile.loadStorage !== undefined ? { loadStorage: profile.loadStorage } : {}),
          ...(profile.saveStorage !== undefined ? { saveStorage: profile.saveStorage } : {}),
          ...(cleanedDescription !== undefined ? { description: cleanedDescription } : {}),
        })) ??
        (await maybeCreateManualFallback({
          name,
          url,
          outputDir: profile.outputDir,
          ...(cleanedDescription !== undefined ? { description: cleanedDescription } : {}),
        }));
      if (fallback) {
        if (opts.improve !== false) {
          try {
            await runAutoImprove(fallback.outputPath, profile.improveMode);
          } catch (improveErr) {
            const message = improveErr instanceof Error ? improveErr.message : String(improveErr);
            ui.warn("Auto-improve failed: " + message);
            ui.warn(
              "You can run it manually: " +
                buildManualImproveCommand(fallback.outputPath, profile.improveMode)
            );
          }
        }
        return;
      }
    }
    throw err;
  }

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

async function maybeCreateInteractivePickFallback(options: {
  name: string;
  url: string;
  description?: string;
  outputDir: string;
  browser: RecordOptions["browser"];
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}): Promise<{ outputPath: string } | null> {
  ui.warn("Playwright codegen did not capture any supported interactions.");
  ui.info(
    "Trying Playwright Pick Locator fallback. Click the target element in the browser, or close it to enter a locator manually."
  );

  try {
    const locator = await pickLocatorInteractively({
      url: options.url,
      browser: options.browser ?? "chromium",
      ...(options.device !== undefined ? { device: options.device } : {}),
      ...(options.testIdAttribute !== undefined
        ? { testIdAttribute: options.testIdAttribute }
        : {}),
      ...(options.loadStorage !== undefined ? { loadStorage: options.loadStorage } : {}),
      ...(options.saveStorage !== undefined ? { saveStorage: options.saveStorage } : {}),
    });

    const target = buildFallbackTarget(locator, {
      warning: "interactive pick locator fallback starter",
    });

    return await saveFallbackStarterTest({
      name: options.name,
      url: options.url,
      outputDir: options.outputDir,
      target,
      modeLabel: "Interactive Pick Locator fallback",
      editHint: "Edit the saved YAML to add more interactions as needed.",
      ...(options.description !== undefined ? { description: options.description } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ui.warn(`Interactive Pick Locator fallback did not complete: ${message}`);
    return null;
  }
}

async function maybeCreateManualFallback(options: {
  name: string;
  url: string;
  description?: string;
  outputDir: string;
}): Promise<{ outputPath: string } | null> {
  const shouldCreate = await confirm({
    message: "Create a starter test from a pasted locator instead?",
    default: true,
  });

  if (!shouldCreate) return null;

  ui.info(
    "In Playwright Inspector, stop recording, use 'Pick Locator' on the framed element, and paste the locator below."
  );

  const locator = (await input({
    message: "Picked locator:",
    validate: (value) => (value.trim().length > 0 ? true : "Locator is required"),
  })).trim();

  const framePathRaw = await input({
    message: "Frame selectors outer->inner (optional, comma-separated):",
  });

  const target = buildManualFallbackTarget(locator, framePathRaw);
  return await saveFallbackStarterTest({
    name: options.name,
    url: options.url,
    outputDir: options.outputDir,
    target,
    modeLabel: "Manual fallback",
    editHint: "Edit the saved YAML to add more framed interactions if needed.",
    ...(options.description !== undefined ? { description: options.description } : {}),
  });
}

function buildManualFallbackTarget(locator: string, framePathRaw: string): Target {
  const framePath = framePathRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return buildFallbackTarget(locator, {
    ...(framePath.length > 0 ? { framePath } : {}),
    warning: "manual iframe fallback starter",
  });
}

function buildFallbackTarget(
  locator: string,
  overrides: Partial<Pick<Target, "framePath" | "warning">> = {}
): Target {
  return {
    value: locator,
    kind: classifySelector(locator).kind,
    source: "manual",
    ...overrides,
  };
}

async function saveFallbackStarterTest(options: {
  name: string;
  url: string;
  description?: string;
  outputDir: string;
  target: Target;
  modeLabel: string;
  editHint: string;
}): Promise<{ outputPath: string }> {
  const action = await promptForFallbackAction();
  const steps: Step[] = [
    { action: "navigate", url: options.url },
    await buildManualFallbackStep(action, options.target),
  ];

  const saved = await saveRecordedYaml({
    name: options.name,
    outputDir: options.outputDir,
    steps,
    startingUrl: options.url,
    ...(options.description !== undefined ? { description: options.description } : {}),
  });

  console.log();
  ui.success(`Starter test saved to ${saved.outputPath}`);
  ui.info(`${options.modeLabel} created (${saved.steps.length} steps)`);
  ui.step(options.editHint);
  ui.info("Run it with: ui-test play " + saved.outputPath);

  return { outputPath: saved.outputPath };
}

async function promptForFallbackAction(): Promise<"assertVisible" | "click" | "fill"> {
  return (await input({
    message: "Starter action [assertVisible/click/fill]:",
    default: "assertVisible",
    validate: (value) => {
      const normalized = value.trim();
      return normalized === "assertVisible" || normalized === "click" || normalized === "fill"
        ? true
        : "Enter assertVisible, click, or fill";
    },
  })).trim() as "assertVisible" | "click" | "fill";
}

async function buildManualFallbackStep(
  action: "assertVisible" | "click" | "fill",
  target: Target
): Promise<Step> {
  if (action === "click") {
    return { action: "click", target };
  }

  if (action === "fill") {
    const text = await input({
      message: "Fill text:",
    });
    return { action: "fill", target, text };
  }

  return { action: "assertVisible", target };
}

function isNoInteractionsError(err: unknown): err is UserError {
  return err instanceof UserError && err.code === RECORDER_NO_INTERACTIONS_ERROR_CODE;
}

async function runAutoImprove(
  testFile: string,
  improveMode: RecordImproveMode
): Promise<void> {
  if (improveMode === "off") {
    return;
  }

  const improveProfile = resolveRecordAutoImproveProfile(improveMode);
  const applyMutations = improveProfile.applySelectors || improveProfile.applyAssertions;
  const appliedBy = applyMutations ? "auto_apply" : "report_only";

  console.log();
  ui.info(`Running auto-improve (${improveMode})...`);
  const improveResult = await improveTestFile({
    testFile,
    ...(applyMutations ? { outputPath: resolveDefaultImproveOutputPath(testFile) } : {}),
    applySelectors: improveProfile.applySelectors,
    applyAssertions: improveProfile.applyAssertions,
    assertions: improveProfile.assertions,
    assertionSource: improveProfile.assertionSource,
    assertionPolicy: improveProfile.assertionPolicy,
    appliedBy,
  });
  const determinismVerdict = formatDeterminismVerdict(improveResult.report.determinism);
  if (determinismVerdict) {
    const autoImproveMessage =
      determinismVerdict.message.charAt(0).toLowerCase() + determinismVerdict.message.slice(1);
    if (determinismVerdict.level === "warn") {
      ui.warn(`Auto-improve ${autoImproveMessage}`);
    } else {
      ui.info(`Auto-improve ${autoImproveMessage}`);
    }
  }

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
  const improveProfile = resolveRecordAutoImproveProfile(improveMode);
  const profileArgs = [
    `--assertions ${improveProfile.assertions}`,
    `--assertion-source ${improveProfile.assertionSource}`,
    `--assertion-policy ${improveProfile.assertionPolicy}`,
  ].join(" ");
  if (improveMode === "apply") {
    const planPath = absolutePath.replace(/(\.[^.]+)?$/, ".improve-plan.json");
    return `ui-test improve ${absolutePath} ${profileArgs} --plan && ui-test improve ${absolutePath} --apply-plan ${planPath}`;
  }
  return `ui-test improve ${absolutePath} ${profileArgs} --no-apply`;
}
