import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { playwrightCodeToSteps } from "./transform/playwright-ast-transform.js";
import { ui } from "../utils/ui.js";
import { UserError } from "../utils/errors.js";
import type {
  RunInteractiveCommand,
} from "./contracts/process-runner.js";
import {
  resolvePlaywrightCliPath,
  runCodegen,
  type CodegenBrowser,
  type CodegenRunOptions,
} from "./recorder-codegen.js";
import {
  normalizeFirstNavigate,
  saveRecordedYaml,
  slugify,
} from "./recording/recording-output.js";

export type RecordBrowser = CodegenBrowser;

export interface RecordOptions {
  name: string;
  url: string;
  description?: string;
  outputDir: string;
  browser?: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export interface RecordResult {
  outputPath: string;
  stepCount: number;
  recordingMode: "codegen";
}

export interface RecorderDependencies {
  runInteractiveCommand?: RunInteractiveCommand;
}

export const RECORDER_NO_INTERACTIONS_ERROR_CODE = "recorder_no_interactions";

export async function record(
  options: RecordOptions,
  dependencies: RecorderDependencies = {}
): Promise<RecordResult> {
  const playwrightBin = await findPlaywrightCli();
  const runInteractiveCommand = dependencies.runInteractiveCommand;
  if (!runInteractiveCommand) {
    throw new Error("Recorder requires a runInteractiveCommand dependency.");
  }
  const browser = options.browser ?? "chromium";

  ui.info("Opening browser for recording...");
  ui.dim("Interact with the page. Close the browser when done.");

  const tmpFile = path.join(os.tmpdir(), `ui-test-recording-${Date.now()}.spec.ts`);

  let codegenError: Error | undefined;
  try {
    const codegenOptions: CodegenRunOptions = {
      url: options.url,
      outputFile: tmpFile,
      browser,
    };
    if (options.device !== undefined) {
      codegenOptions.device = options.device;
    }
    if (options.testIdAttribute !== undefined) {
      codegenOptions.testIdAttribute = options.testIdAttribute;
    }
    if (options.loadStorage !== undefined) {
      codegenOptions.loadStorage = options.loadStorage;
    }
    if (options.saveStorage !== undefined) {
      codegenOptions.saveStorage = options.saveStorage;
    }
    await runCodegen(playwrightBin, codegenOptions, runInteractiveCommand);
  } catch (err) {
    codegenError = err instanceof Error ? err : new Error(String(err));
  }

  let code = "";
  try {
    code = await fs.readFile(tmpFile, "utf-8");
  } catch {
    code = "";
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }

  const steps = playwrightCodeToSteps(code);
  if (steps.length === 0) {
    const reason = codegenError
      ? `Codegen failed: ${codegenError.message}`
      : "Parser found no supported interactions.";
    throw new UserError(
      "No interactions were recorded.",
      `${reason} If the page uses frames or iframes, Playwright codegen may miss framed interactions on some sites. Try Chromium first, use the inspector's Pick Locator flow for elements inside the frame, or record a simpler path and add the framed locator manually.`,
      RECORDER_NO_INTERACTIONS_ERROR_CODE
    );
  }

  if (codegenError) {
    ui.warn(`Recorder exited unexpectedly (${codegenError.message}), but captured steps were recovered.`);
  }

  const saved = await saveRecordedYaml({
    name: options.name,
    outputDir: options.outputDir,
    steps,
    startingUrl: options.url,
    ...(options.description !== undefined ? { description: options.description } : {}),
  });

  return {
    outputPath: saved.outputPath,
    stepCount: saved.steps.length,
    recordingMode: "codegen",
  };
}

async function findPlaywrightCli(): Promise<string> {
  try {
    const pwPath = import.meta.resolve?.("playwright/cli");
    if (typeof pwPath === "string" && pwPath.length > 0) {
      const resolved = resolvePlaywrightCliPath(pwPath);
      await fs.access(resolved);
      return resolved;
    }
  } catch {
    // fallback
  }

  return "npx";
}

export { runCodegen, resolvePlaywrightCliPath };
export { normalizeFirstNavigate, slugify };
