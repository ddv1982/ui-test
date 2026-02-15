#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const here = path.dirname(fileURLToPath(import.meta.url));
const localBin = path.resolve(here, "..", "dist", "bin", "ui-test.js");
const args = process.argv.slice(2);

if (existsSync(localBin)) {
  const result = spawnSync(process.execPath, [localBin, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (process.env.UI_TEST_BIN_FALLBACK === "1") {
  console.error("[ui-test] Install is incomplete and fallback execution also failed.");
  console.error("[ui-test] Run one-off directly: npx -y github:ddv1982/easy-e2e-testing help");
  process.exit(1);
}

const fallback = spawnSync("npx", ["-y", "github:ddv1982/easy-e2e-testing", ...args], {
  stdio: "inherit",
  env: { ...process.env, UI_TEST_BIN_FALLBACK: "1" },
  shell: isWin,
});

process.exit(fallback.status ?? 1);
