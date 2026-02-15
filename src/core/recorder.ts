import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
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
import { runInteractiveCommand } from "../infra/process/command-runner.js";

export type RecordBrowser = "chromium" | "firefox" | "webkit";
type JsonlCapability = "supported" | "unsupported" | "unknown";

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

export async function record(options: RecordOptions): Promise<RecordResult> {
  const playwrightBin = await findPlaywrightCli();
  const selectorPolicy = options.selectorPolicy ?? "reliable";
  const browser = options.browser ?? "chromium";
  const jsonlCapability = await detectJsonlCapability(playwrightBin);
  const jsonlDisabledByEnv = process.env.UI_TEST_DISABLE_JSONL === "1";

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
      await runCodegen(playwrightBin, {
        url: options.url,
        outputFile: jsonlTmpFile,
        target: "jsonl",
        browser,
        device: options.device,
        testIdAttribute: options.testIdAttribute,
        loadStorage: options.loadStorage,
        saveStorage: options.saveStorage,
      });
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

    const outputPath = await saveRecordingYaml(options, transformed.steps);
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

  const fallback = await recordWithPlaywrightTestFallback(playwrightBin, options, browser);
  const outputPath = await saveRecordingYaml(options, fallback.steps);

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
  browser: RecordBrowser
): Promise<{ steps: Step[]; stats: RecordingTransformStats }> {
  const tmpFile = path.join(os.tmpdir(), `ui-test-recording-fallback-${Date.now()}.spec.ts`);

  let fallbackError: Error | undefined;
  try {
    await runCodegen(playwrightBin, {
      url: options.url,
      outputFile: tmpFile,
      target: "playwright-test",
      browser,
      device: options.device,
      testIdAttribute: options.testIdAttribute,
      loadStorage: options.loadStorage,
      saveStorage: options.saveStorage,
    });
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

  const yamlContent = stepsToYaml(options.name, steps, {
    description: options.description,
    baseUrl,
  });

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

async function detectJsonlCapability(playwrightBin: string): Promise<JsonlCapability> {
  if (playwrightBin === "npx") return "unknown";

  const resolvedCliPath = resolvePlaywrightCliPath(playwrightBin);
  if (!resolvedCliPath.includes("node_modules")) return "unknown";

  const jsonlGeneratorPath = path.resolve(
    path.dirname(resolvedCliPath),
    "../playwright-core/lib/server/codegen/jsonl.js"
  );

  try {
    await fs.access(jsonlGeneratorPath);
    return "supported";
  } catch {
    return "unsupported";
  }
}

interface CodegenRunOptions {
  url: string;
  outputFile: string;
  target: "jsonl" | "playwright-test";
  browser: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

function runCodegen(playwrightBin: string, options: CodegenRunOptions): Promise<void> {
  return runCodegenInternal(playwrightBin, options);
}

async function runCodegenInternal(playwrightBin: string, options: CodegenRunOptions): Promise<void> {
  const argsCore = [
    "codegen",
    "--target",
    options.target,
    "--output",
    options.outputFile,
    "--browser",
    options.browser,
  ];

  if (options.device?.trim()) {
    argsCore.push("--device", options.device.trim());
  }
  if (options.testIdAttribute?.trim()) {
    argsCore.push("--test-id-attribute", options.testIdAttribute.trim());
  }
  if (options.loadStorage?.trim()) {
    argsCore.push("--load-storage", options.loadStorage.trim());
  }
  if (options.saveStorage?.trim()) {
    argsCore.push("--save-storage", options.saveStorage.trim());
  }

  argsCore.push(options.url);
  const args = playwrightBin === "npx" ? ["playwright", ...argsCore] : argsCore;
  const result = await runInteractiveCommand(playwrightBin, args, {
    stdio: ["inherit", "inherit", "inherit"],
  });

  if (result.exitCode === 0) return;
  if (result.signal) {
    throw new Error(`Playwright codegen exited via signal ${result.signal}`);
  }
  throw new Error(`Playwright codegen exited with code ${result.exitCode ?? "unknown"}`);
}

function resolvePlaywrightCliPath(pathOrFileUrl: string): string {
  return pathOrFileUrl.startsWith("file://")
    ? fileURLToPath(pathOrFileUrl)
    : pathOrFileUrl;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export { runCodegen, resolvePlaywrightCliPath, detectJsonlCapability };
