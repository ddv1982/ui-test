import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIN_NODE_MAJOR = 18;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function main() {
  try {
    ensureNodeVersion();
    ensureLocalCliBuilt();
    runCliSetup(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[setup] FAILED: ${message}`);
    process.exitCode = 1;
  }
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${process.versions.node}`
    );
  }
}

function ensureLocalCliBuilt() {
  const cliEntry = resolveLocalCliEntry();
  runCommand("Prepare local CLI build", process.execPath, [
    path.resolve(repoRoot, "scripts", "prepare-build.mjs"),
  ]);

  if (!existsSync(cliEntry)) {
    throw new Error(
      `Local ui-test CLI not found at ${cliEntry} after build.`
    );
  }
}

function runCliSetup(argv) {
  const cliEntry = resolveLocalCliEntry();
  runCommand("Run local ui-test setup", process.execPath, [
    cliEntry,
    "setup",
    ...argv,
  ]);
}

function resolveLocalCliEntry() {
  return path.resolve(repoRoot, "dist", "bin", "ui-test.js");
}

function runCommand(label, command, args) {
  console.log(`[setup] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

export {
  ensureLocalCliBuilt,
  ensureNodeVersion,
  resolveLocalCliEntry,
  runCliSetup,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
