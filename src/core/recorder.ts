import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  jsonlToRecordingSteps,
  type RecordSelectorPolicy,
  type RecordingTransformStats,
} from "./transform/jsonl-transform.js";
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
  detectJsonlCapability,
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
  selectorPolicy?: RecordSelectorPolicy;
  browser?: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export interface RecordResult {
  outputPath: string;
  stats: RecordingTransformStats;
  recordingMode: "jsonl" | "fallback";
  degraded: boolean;
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
  const selectorPolicy = options.selectorPolicy ?? "reliable";
  const browser = options.browser ?? "chromium";
  const jsonlCapability = await detectJsonlCapability(playwrightBin);
  const jsonlDisabledByEnv = process.env["UI_TEST_DISABLE_JSONL"] === "1";

  if (jsonlDisabledByEnv) {
    ui.warn("JSONL recording disabled by UI_TEST_DISABLE_JSONL=1; using playwright-test fallback mode.");
  } else if (jsonlCapability === "unsupported") {
    ui.warn("JSONL target internals were not detected in this Playwright install; using playwright-test fallback mode.");
  } else {
    ui.warn("Recorder uses Playwright's hidden JSONL target first; this may break across Playwright versions.");
  }
  ui.info("Opening browser for recording...");
  ui.dim("Interact with the page. Close the browser when done.");

  const jsonlTmpFile = path.join(os.tmpdir(), `ui-test-recording-${Date.now()}.jsonl`);

  let codegenJsonlError: Error | undefined;
  let jsonlContent = "";

  if (jsonlDisabledByEnv) {
    codegenJsonlError = new Error("JSONL recording disabled by UI_TEST_DISABLE_JSONL=1.");
  } else if (jsonlCapability === "unsupported") {
    codegenJsonlError = new Error("JSONL target internals not detected in installed Playwright package.");
  } else {
    try {
      const jsonlCodegenOptions: CodegenRunOptions = {
        url: options.url,
        outputFile: jsonlTmpFile,
        target: "jsonl",
        browser,
      };
      if (options.device !== undefined) {
        jsonlCodegenOptions.device = options.device;
      }
      if (options.testIdAttribute !== undefined) {
        jsonlCodegenOptions.testIdAttribute = options.testIdAttribute;
      }
      if (options.loadStorage !== undefined) {
        jsonlCodegenOptions.loadStorage = options.loadStorage;
      }
      if (options.saveStorage !== undefined) {
        jsonlCodegenOptions.saveStorage = options.saveStorage;
      }
      await runCodegen(
        playwrightBin,
        jsonlCodegenOptions,
        runInteractiveCommand
      );
    } catch (err) {
      codegenJsonlError = err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    jsonlContent = await fs.readFile(jsonlTmpFile, "utf-8");
  } catch {
    jsonlContent = "";
  } finally {
    await fs.unlink(jsonlTmpFile).catch(() => {});
  }

  const transformed = jsonlToRecordingSteps(jsonlContent, { selectorPolicy });
  if (transformed.steps.length > 0) {
    if (codegenJsonlError) {
      ui.warn(`Recorder exited unexpectedly (${codegenJsonlError.message}), but captured JSONL steps were recovered.`);
    }

    const normalizedSteps = normalizeFirstNavigate(transformed.steps, options.url);
    const outputPath = await saveRecordingYaml(options, normalizedSteps);
    return {
      outputPath,
      stats: transformed.stats,
      recordingMode: "jsonl",
      degraded: transformed.stats.fallbackSelectors > 0,
    };
  }

  if (!codegenJsonlError) {
    throw new UserError(
      "No interactions were recorded.",
      "Try again and make sure to click, type, or interact with elements on the page."
    );
  }

  ui.warn("JSONL recording yielded no usable steps. Falling back to playwright-test codegen parsing.");
  ui.warn(`JSONL failure reason: ${codegenJsonlError.message}`);

  const fallback = await recordWithPlaywrightTestFallback(
    playwrightBin,
    options,
    browser,
    runInteractiveCommand
  );
  const normalizedSteps = normalizeFirstNavigate(fallback.steps, options.url);
  const outputPath = await saveRecordingYaml(options, normalizedSteps);

  return {
    outputPath,
    stats: fallback.stats,
    recordingMode: "fallback",
    degraded: true,
  };
}

async function recordWithPlaywrightTestFallback(
  playwrightBin: string,
  options: RecordOptions,
  browser: RecordBrowser,
  runInteractiveCommand: RunInteractiveCommand
): Promise<{ steps: Step[]; stats: RecordingTransformStats }> {
  const tmpFile = path.join(os.tmpdir(), `ui-test-recording-fallback-${Date.now()}.spec.ts`);

  let fallbackError: Error | undefined;
  try {
    const fallbackCodegenOptions: CodegenRunOptions = {
      url: options.url,
      outputFile: tmpFile,
      target: "playwright-test",
      browser,
    };
    if (options.device !== undefined) {
      fallbackCodegenOptions.device = options.device;
    }
    if (options.testIdAttribute !== undefined) {
      fallbackCodegenOptions.testIdAttribute = options.testIdAttribute;
    }
    if (options.loadStorage !== undefined) {
      fallbackCodegenOptions.loadStorage = options.loadStorage;
    }
    if (options.saveStorage !== undefined) {
      fallbackCodegenOptions.saveStorage = options.saveStorage;
    }
    await runCodegen(
      playwrightBin,
      fallbackCodegenOptions,
      runInteractiveCommand
    );
  } catch (err) {
    fallbackError = err instanceof Error ? err : new Error(String(err));
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
    const fallbackMessage = fallbackError ? `Fallback codegen failed: ${fallbackError.message}` : "Fallback parser found no supported interactions.";
    throw new UserError(
      "No interactions were recorded.",
      `${fallbackMessage} Try again and make sure to click, type, or interact with elements on the page.`
    );
  }

  const selectorSteps = steps.filter((step) => step.action !== "navigate").length;
  return {
    steps,
    stats: {
      selectorSteps,
      stableSelectors: 0,
      fallbackSelectors: selectorSteps,
      frameAwareSelectors: 0,
    },
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

function slugify(text: string): string {
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

export { runCodegen, resolvePlaywrightCliPath, detectJsonlCapability };
