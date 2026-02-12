#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageJsonPath = path.join(repoRoot, "package.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const packageNameArg = process.argv[2];
const packageName = typeof packageNameArg === "string" && packageNameArg.trim().length > 0
  ? packageNameArg.trim()
  : packageJson.name;

if (!packageName || typeof packageName !== "string") {
  console.error("Unable to determine package name to check.");
  process.exit(2);
}

const result = spawnSync("npm", ["view", packageName, "version"], {
  cwd: repoRoot,
  encoding: "utf-8",
  shell: process.platform === "win32",
  env: process.env,
});

const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
const combined = `${stdout}\n${stderr}`;
const lowerCombined = combined.toLowerCase();

if (result.status === 0) {
  const versionSuffix = stdout ? ` (latest: ${stdout})` : "";
  console.error(`Package name '${packageName}' is already taken${versionSuffix}.`);
  process.exit(1);
}

const isClearlyNotFound =
  /E404|ENOVERSIONS|404 Not Found/i.test(combined) &&
  (lowerCombined.includes("not found") || lowerCombined.includes("could not be found"));

if (isClearlyNotFound) {
  console.log(`Package name '${packageName}' appears available on npm.`);
  process.exit(0);
}

console.error(`Unable to verify npm package name '${packageName}'.`);
console.error("The npm registry response was ambiguous (for example private/inaccessible package).");
if (stderr) {
  console.error(stderr);
}
process.exit(2);
