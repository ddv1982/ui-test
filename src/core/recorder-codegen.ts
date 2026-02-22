import { spawn, type SpawnOptions } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  InteractiveCommandResult,
  RunInteractiveCommand,
} from "./contracts/process-runner.js";

export type CodegenBrowser = "chromium" | "firefox" | "webkit";

export interface CodegenRunOptions {
  url: string;
  outputFile: string;
  browser: CodegenBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export async function runCodegen(
  playwrightBin: string,
  options: CodegenRunOptions,
  runInteractiveCommand: RunInteractiveCommand = defaultRunInteractiveCommand
): Promise<void> {
  const argsCore = [
    "codegen",
    "--target",
    "playwright-test",
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

export function resolvePlaywrightCliPath(pathOrFileUrl: string): string {
  return pathOrFileUrl.startsWith("file://")
    ? fileURLToPath(pathOrFileUrl)
    : pathOrFileUrl;
}

export function defaultRunInteractiveCommand(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<InteractiveCommandResult> {
  return new Promise((resolve, reject) => {
    const child = options ? spawn(command, args, options) : spawn(command, args);

    child.on("error", (err) => reject(err));
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === null) {
        resolve({ signal });
        return;
      }
      resolve({ exitCode: code, signal });
    });
  });
}
