import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packCurrentWorkspaceSilent, removeTarball } from "./check-pack-silent.mjs";

function installedUiTestBin(globalPrefix) {
  return path.join(globalPrefix, "bin", process.platform === "win32" ? "ui-test.cmd" : "ui-test");
}

export function runGlobalInstallSmokeCheck() {
  const tarballPath = packCurrentWorkspaceSilent();
  const globalPrefix = path.join(
    os.tmpdir(),
    `ui-test-global-install-smoke-${process.pid}-${Date.now()}`
  );
  const workspace = path.join(globalPrefix, "cwd");

  try {
    mkdirSync(globalPrefix, { recursive: true });
    mkdirSync(path.join(globalPrefix, "lib"), { recursive: true });
    mkdirSync(path.join(globalPrefix, "bin"), { recursive: true });
    mkdirSync(workspace, { recursive: true });

    const installResult = spawnSync("npm", ["i", "-g", tarballPath], {
      cwd: workspace,
      encoding: "utf-8",
      env: {
        ...process.env,
        npm_config_prefix: globalPrefix,
      },
    });

    if (installResult.status !== 0) {
      if (installResult.stdout) process.stdout.write(installResult.stdout);
      if (installResult.stderr) process.stderr.write(installResult.stderr);
      throw new Error(`npm i -g <tarball> failed with status ${installResult.status ?? 1}.`);
    }

    const helpResult = spawnSync(installedUiTestBin(globalPrefix), ["--help"], {
      cwd: workspace,
      encoding: "utf-8",
      env: process.env,
    });

    if (helpResult.status !== 0) {
      if (helpResult.stdout) process.stdout.write(helpResult.stdout);
      if (helpResult.stderr) process.stderr.write(helpResult.stderr);
      throw new Error(`Installed ui-test --help failed with status ${helpResult.status ?? 1}.`);
    }
  } finally {
    removeTarball(tarballPath);
    rmSync(globalPrefix, { recursive: true, force: true });
  }

  process.stdout.write("global-install-smoke-ok\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runGlobalInstallSmokeCheck();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
