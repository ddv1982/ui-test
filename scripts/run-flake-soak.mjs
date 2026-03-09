/* global console, process */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const DEFAULT_FLAKE_TEST_FILES = [
  "src/core/play/player-runner.integration.test.ts",
  "src/core/improve/improve.dynamic.integration.test.ts",
];

export function resolveFlakeIterations(env = process.env) {
  const raw = env.UI_TEST_FLAKE_ITERATIONS;
  if (!raw) return 5;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid UI_TEST_FLAKE_ITERATIONS: ${raw}`);
  }
  return parsed;
}

export function resolveFlakeTestFiles(env = process.env) {
  const raw = env.UI_TEST_FLAKE_TEST_FILES;
  if (!raw) return [...DEFAULT_FLAKE_TEST_FILES];

  const files = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (files.length === 0) {
    throw new Error("UI_TEST_FLAKE_TEST_FILES resolved to an empty test file list.");
  }

  return [...new Set(files)];
}

function defaultReportPath(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, ".ui-test-artifacts", "flake-soak", `flake-soak-${stamp}.json`);
}

export function resolveFlakeReportPath(env = process.env, now = new Date()) {
  const raw = env.UI_TEST_FLAKE_REPORT_PATH;
  if (!raw || raw.trim().length === 0) return defaultReportPath(now);
  return path.resolve(repoRoot, raw.trim());
}

export function runSingleIteration({ vitestEntry, testFile, iteration, iterations }) {
  console.log(`[flake-soak] Iteration ${iteration}/${iterations} :: ${testFile}`);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [vitestEntry, "run", testFile], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      UI_TEST_REQUIRE_HEADED_PARITY: "1",
    },
  });
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    return {
      iteration,
      testFile,
      status: 1,
      durationMs,
      error: result.error.message,
    };
  }

  return {
    iteration,
    testFile,
    status: result.status ?? 1,
    durationMs,
  };
}

export async function runFlakeSoak(config = {}) {
  const iterations = config.iterations ?? resolveFlakeIterations();
  const testFiles = config.testFiles ?? resolveFlakeTestFiles();
  const reportPath = config.reportPath ?? resolveFlakeReportPath();

  const vitestEntry = path.resolve(repoRoot, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitestEntry)) {
    throw new Error(`[flake-soak] vitest entry not found at ${vitestEntry}. Run npm ci first.`);
  }

  console.log(`[flake-soak] Running ${iterations} iterations across ${testFiles.length} files.`);
  for (const file of testFiles) {
    console.log(`  - ${file}`);
  }

  const runs = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    for (const testFile of testFiles) {
      runs.push(runSingleIteration({ vitestEntry, testFile, iteration, iterations }));
    }
  }

  const failures = runs.filter((run) => run.status !== 0).length;
  const passes = runs.length - failures;
  const perFile = {};
  for (const file of testFiles) {
    const fileRuns = runs.filter((run) => run.testFile === file);
    const fileFailures = fileRuns.filter((run) => run.status !== 0).length;
    perFile[file] = {
      passes: fileRuns.length - fileFailures,
      failures: fileFailures,
      failureRate:
        fileRuns.length === 0 ? 0 : Number((fileFailures / fileRuns.length).toFixed(4)),
    };
  }
  const report = {
    generatedAt: new Date().toISOString(),
    iterations,
    testFiles,
    runs,
    quarantinePolicy: {
      failRateThreshold: 0.05,
      minFailures: 2,
      action: "quarantine_candidate",
    },
    totals: {
      passes,
      failures,
      failureRate: runs.length === 0 ? 0 : Number((failures / runs.length).toFixed(4)),
      perFile,
    },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[flake-soak] Report written to ${reportPath}`);
  console.log(
    `[flake-soak] Summary: passes=${passes}, failures=${failures}, failureRate=${report.totals.failureRate}`
  );

  return {
    exitCode: failures > 0 ? 1 : 0,
    reportPath,
    report,
  };
}

async function main() {
  try {
    const result = await runFlakeSoak();
    process.exitCode = result.exitCode;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
