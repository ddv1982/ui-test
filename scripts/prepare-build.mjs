#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const isWin = process.platform === "win32";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });

  if (typeof result.status !== "number") {
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

const hasTypeScript = existsSync(path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"));
const hasCoreDependency = existsSync(path.join(repoRoot, "node_modules", "commander", "package.json"));

if (!hasTypeScript || !hasCoreDependency) {
  run("npm", [
    "install",
    "--global=false",
    "--ignore-scripts",
    "--include=dev",
    "--include=peer",
    "--include=optional",
    "--no-audit",
    "--no-fund",
  ]);
}

run("npm", ["run", "-s", "build"]);
