import fs from "node:fs/promises";
import path from "node:path";
import { PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { devtoolsRecordingToSteps } from "../../core/transform/devtools-recording-adapter.js";
import { stepsToYaml } from "../../core/transform/yaml-io.js";
import {
  canonicalEventsToSteps,
  stepsToCanonicalEvents,
} from "../../core/recording/canonical-events.js";
import { normalizeFirstNavigate, slugify } from "../../core/recorder.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";
import { parseRecordImproveMode, type RecordImproveMode } from "../options/record-profile.js";

interface RecordImportOptions {
  fromFile?: string;
  improveMode?: string;
  name?: string;
  description?: string;
  outputDir?: string;
}

interface ImportedRecordingResult {
  outputPath: string;
  improveMode: RecordImproveMode;
}

export async function importRecordFromFile(
  opts: RecordImportOptions
): Promise<ImportedRecordingResult> {
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

  const name = opts.name ?? result.title ?? path.basename(filePath, path.extname(filePath));
  const outputDir = opts.outputDir ?? PLAY_DEFAULT_TEST_DIR;
  const outputPath = path.join(outputDir, `${slugify(name) || `test-${Date.now()}`}.yaml`);

  const firstStep = result.steps[0];
  const firstNavigateUrl = firstStep?.action === "navigate" ? firstStep.url : undefined;
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

  return {
    outputPath,
    improveMode,
  };
}
