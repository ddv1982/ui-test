import fs from "node:fs/promises";
import path from "node:path";
import { PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { saveRecordedYaml } from "../../core/recording/recording-output.js";
import { devtoolsRecordingToSteps } from "../../core/transform/devtools-recording-adapter.js";
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
  const improveMode = parseRecordImproveMode(opts.improveMode) ?? "report";

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

  const firstStep = result.steps[0];
  const firstNavigateUrl = firstStep?.action === "navigate" ? firstStep.url : undefined;
  const saved = await saveRecordedYaml({
    name,
    outputDir,
    steps: result.steps,
    ...(opts.description !== undefined ? { description: opts.description } : {}),
    ...(firstNavigateUrl !== undefined ? { startingUrl: firstNavigateUrl } : {}),
  });

  console.log();
  ui.success(`Test saved to ${saved.outputPath}`);
  ui.info(
    `Imported ${saved.steps.length} steps from DevTools recording (${result.skipped} skipped)`
  );
  ui.info("Run it with: ui-test play " + saved.outputPath);

  return {
    outputPath: saved.outputPath,
    improveMode,
  };
}
