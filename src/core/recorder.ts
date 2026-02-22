import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { playwrightCodeToSteps } from "./transform/playwright-ast-transform.js";
import { stepsToYaml } from "./transform/yaml-io.js";
import type { Step } from "./yaml-schema.js";
import { ui } from "../utils/ui.js";
import { UserError } from "../utils/errors.js";
import type {
  RunInteractiveCommand,
} from "./contracts/process-runner.js";
import {
  defaultRunInteractiveCommand,
  resolvePlaywrightCliPath,
  runCodegen,
  type CodegenBrowser,
  type CodegenRunOptions,
} from "./recorder-codegen.js";

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

export async function record(
  options: RecordOptions,
  dependencies: RecorderDependencies = {}
): Promise<RecordResult> {
  const playwrightBin = await findPlaywrightCli();
  const runInteractiveCommand =
    dependencies.runInteractiveCommand ?? defaultRunInteractiveCommand;
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
      `${reason} Try again and make sure to click, type, or interact with elements on the page.`
    );
  }

  if (codegenError) {
    ui.warn(`Recorder exited unexpectedly (${codegenError.message}), but captured steps were recovered.`);
  }

  const normalizedSteps = normalizeFirstNavigate(steps, options.url);
  const outputPath = await saveRecordingYaml(options, normalizedSteps);

  return {
    outputPath,
    stepCount: normalizedSteps.length,
    recordingMode: "codegen",
  };
}

async function saveRecordingYaml(options: RecordOptions, steps: Step[]): Promise<string> {
  let baseUrl: string | undefined;
  try {
    const parsed = new URL(options.url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    // ignore
  }

  const yamlOptions: { description?: string; baseUrl?: string } = {};
  if (options.description !== undefined) {
    yamlOptions.description = options.description;
  }
  if (baseUrl !== undefined) {
    yamlOptions.baseUrl = baseUrl;
  }

  const yamlContent = stepsToYaml(options.name, steps, yamlOptions);

  const slug = slugify(options.name) || `test-${Date.now()}`;
  const filename = `${slug}.yaml`;
  const outputPath = path.join(options.outputDir, filename);
  await fs.mkdir(options.outputDir, { recursive: true });
  await fs.writeFile(outputPath, yamlContent, "utf-8");
  return outputPath;
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

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeFirstNavigate(steps: Step[], startingUrl: string): Step[] {
  let startPath: string;
  try {
    const parsed = new URL(startingUrl);
    startPath = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return steps;
  }

  if (steps.length === 0) return steps;

  const firstStep = steps[0];
  if (firstStep?.action === "navigate") {
    return [{ ...firstStep, url: startPath }, ...steps.slice(1)];
  }

  // No navigate as first step — inject one
  return [{ action: "navigate" as const, url: startPath }, ...steps];
}

export { runCodegen, resolvePlaywrightCliPath };
