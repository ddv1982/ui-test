import type { Command } from "commander";
import path from "node:path";
import { globby } from "globby";
import { play, type TestResult } from "../core/player.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";

export function registerPlay(program: Command) {
  program
    .command("play")
    .description("Replay one or all YAML tests")
    .argument("[test]", "Path to a specific test file, or omit to run all")
    .option("--headed", "Run browser in headed mode (visible)")
    .option("--timeout <ms>", "Step timeout in milliseconds")
    .action(async (testArg, opts) => {
      try {
        await runPlay(testArg, opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runPlay(
  testArg: string | undefined,
  opts: { headed?: boolean; timeout?: string }
) {
  const config = await loadConfig();
  const headed = opts.headed ?? config.headed ?? false;
  const cliTimeout =
    opts.timeout !== undefined
      ? parseTimeout(opts.timeout, "CLI flag --timeout")
      : undefined;
  const timeout = cliTimeout ?? config.timeout ?? 10_000;

  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
    throw new UserError(
      `Invalid timeout value: ${timeout}`,
      "Timeout must be a positive integer in milliseconds."
    );
  }

  let files: string[];

  if (testArg) {
    files = [path.resolve(testArg)];
  } else {
    const testDir = config.testDir ?? "tests";
    files = await globby(`${testDir}/**/*.{yaml,yml}`);
    if (files.length === 0) {
      throw new UserError(
        `No test files found in ${testDir}/`,
        "Record a test first: npx easy-e2e record"
      );
    }
    files.sort();
  }

  ui.heading(`Running ${files.length} test${files.length > 1 ? "s" : ""}...`);
  console.log();

  const results: TestResult[] = [];

  for (const file of files) {
    ui.info(`Test: ${file}`);
    const result = await play(file, { headed, timeout });
    results.push(result);
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log();
  ui.heading("Results");
  if (failed === 0) {
    ui.success(`All ${passed} test${passed > 1 ? "s" : ""} passed (${totalMs}ms)`);
  } else {
    ui.error(
      `${failed} failed, ${passed} passed out of ${results.length} test${results.length > 1 ? "s" : ""} (${totalMs}ms)`
    );
    process.exitCode = 1;
  }
}

function parseTimeout(input: string, source: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid timeout value from ${source}: ${input}`,
      "Use a positive integer in milliseconds, for example: --timeout 10000"
    );
  }
  return value;
}
