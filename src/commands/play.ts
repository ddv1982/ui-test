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
  const timeout = opts.timeout ? Number(opts.timeout) : (config.timeout ?? 10_000);

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
