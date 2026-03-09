/* global console, process */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globby } from "globby";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const PARITY_SUITE_PATTERNS = [
  {
    id: "player-core",
    patterns: ["src/core/play/player-runner.integration.test.ts"],
  },
  {
    id: "improve-runtime",
    patterns: ["src/core/improve/*.integration.test.ts"],
  },
];

export async function resolveParityTestFiles(
  suites = PARITY_SUITE_PATTERNS,
  cwd = repoRoot
) {
  const resolved = [];

  for (const suite of suites) {
    const files = await globby(suite.patterns, {
      cwd,
      onlyFiles: true,
      unique: true,
      expandDirectories: false,
    });

    if (files.length === 0) {
      throw new Error(
        `Parity suite '${suite.id}' resolved to zero test files. Patterns: ${suite.patterns.join(", ")}`
      );
    }

    resolved.push(...files);
  }

  return [...new Set(resolved)].sort();
}

export async function runHeadedParity(testFiles) {
  const vitestEntry = path.resolve(repoRoot, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitestEntry)) {
    console.error(`[headed-parity] vitest entry not found at ${vitestEntry}. Run npm ci first.`);
    return 1;
  }

  const files = testFiles ?? (await resolveParityTestFiles());
  if (files.length === 0) {
    console.error("[headed-parity] No parity tests resolved.");
    return 1;
  }

  console.log(`[headed-parity] Running parity suites (${files.length} files):`);
  for (const file of files) {
    console.log(`  - ${file}`);
  }

  const result = spawnSync(process.execPath, [vitestEntry, "run", ...files], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      UI_TEST_REQUIRE_HEADED_PARITY: "1",
    },
  });

  if (result.error) {
    console.error(`[headed-parity] Failed to run parity tests: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

async function main() {
  try {
    process.exitCode = await runHeadedParity();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[headed-parity] ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
