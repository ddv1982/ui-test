import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const PARITY_TEST_FILES = [
  "src/core/player.integration.test.ts",
  "src/core/improve/improve.volatile.integration.test.ts",
];

function main() {
  const vitestEntry = path.resolve(repoRoot, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitestEntry)) {
    console.error(`[headed-parity] vitest entry not found at ${vitestEntry}. Run npm ci first.`);
    process.exitCode = 1;
    return;
  }

  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", ...PARITY_TEST_FILES],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        UI_TEST_REQUIRE_HEADED_PARITY: "1",
      },
    }
  );

  if (result.error) {
    console.error(`[headed-parity] Failed to run parity tests: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
