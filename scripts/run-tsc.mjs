#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const repoRoot = path.resolve(scriptDir, "..");
const isWin = process.platform === "win32";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveTypeScriptSpecFromPackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    return undefined;
  }

  const parsed = packageJson;
  const devDependencies = parsed.devDependencies;
  if (devDependencies && typeof devDependencies === "object" && !Array.isArray(devDependencies)) {
    const devSpec = devDependencies.typescript;
    if (isNonEmptyString(devSpec)) return devSpec.trim();
  }

  const dependencies = parsed.dependencies;
  if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
    const depSpec = dependencies.typescript;
    if (isNonEmptyString(depSpec)) return depSpec.trim();
  }

  return undefined;
}

export function resolveTypeScriptSpec(repoRootPath = repoRoot) {
  const packageJsonPath = path.join(repoRootPath, "package.json");
  try {
    const raw = readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    return resolveTypeScriptSpecFromPackageJson(parsed);
  } catch {
    return undefined;
  }
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
  return result.status ?? 1;
}

export function runTsc(tscArgs = process.argv.slice(2), repoRootPath = repoRoot) {
  const skipLocal = process.env.UI_TEST_SKIP_LOCAL_TSC === "1";
  const localBin = path.join(repoRootPath, "node_modules", ".bin", isWin ? "tsc.cmd" : "tsc");

  if (!skipLocal && existsSync(localBin)) {
    return run(localBin, tscArgs, repoRootPath);
  }

  const typeScriptSpec = resolveTypeScriptSpec(repoRootPath);
  if (!typeScriptSpec) {
    console.error(
      "[run-tsc] Missing TypeScript version spec in package.json (devDependencies.typescript or dependencies.typescript)."
    );
    console.error("[run-tsc] Fallback compile cannot proceed safely without an explicit TypeScript spec.");
    return 1;
  }

  const tempPrefix = path.join(os.tmpdir(), "ui-test-tsc-");
  const tempDir = mkdtempSync(tempPrefix);
  try {
    const installStatus = run(
      "npm",
      [
        "install",
        "--prefix",
        tempDir,
        "--no-save",
        "--no-package-lock",
        `typescript@${typeScriptSpec}`,
      ],
      repoRootPath
    );
    if (installStatus !== 0) return installStatus;

    const fallbackBin = path.join(tempDir, "node_modules", ".bin", isWin ? "tsc.cmd" : "tsc");
    return run(fallbackBin, tscArgs, repoRootPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  process.exit(runTsc());
}
