import { spawnSync } from "node:child_process";
import { accessSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractTarballName, removeTarball } from "./check-pack-silent.mjs";

const DEFAULT_REMOTE_PACKAGE_SPEC = "github:ddv1982/ui-test";
const DEFAULT_REMOTE_PACKAGE_FALLBACK_SPEC = "git+https://github.com/ddv1982/ui-test.git";

function packRemotePackageSilent(remotePackageSpec) {
  return spawnSync("npm", ["pack", remotePackageSpec, "--silent"], {
    encoding: "utf-8",
  });
}

export function runRemoteGlobalInstallDryRun() {
  const remotePackageSpec =
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC?.trim() ||
    DEFAULT_REMOTE_PACKAGE_SPEC;

  let packResult = packRemotePackageSilent(remotePackageSpec);
  if (
    !process.env.UI_TEST_REMOTE_PACKAGE_SPEC &&
    packResult.status !== 0 &&
    remotePackageSpec === DEFAULT_REMOTE_PACKAGE_SPEC
  ) {
    packResult = packRemotePackageSilent(DEFAULT_REMOTE_PACKAGE_FALLBACK_SPEC);
  }

  if (packResult.status !== 0) {
    if (packResult.stdout) process.stdout.write(packResult.stdout);
    if (packResult.stderr) process.stderr.write(packResult.stderr);
    throw new Error(
      `npm pack ${remotePackageSpec} --silent failed with status ${packResult.status ?? 1}.`
    );
  }

  const tarballName =
    extractTarballName(packResult.stdout ?? "") ??
    extractTarballName(packResult.stderr ?? "");
  if (!tarballName) {
    throw new Error(
      `npm pack ${remotePackageSpec} --silent did not return a tarball filename.`
    );
  }

  const tarballPath = path.resolve(process.cwd(), tarballName);
  accessSync(tarballPath);

  const globalPrefix = path.join(
    os.tmpdir(),
    `ui-test-remote-global-install-${process.pid}-${Date.now()}`
  );

  try {
    mkdirSync(globalPrefix, { recursive: true });
    mkdirSync(path.join(globalPrefix, "lib"), { recursive: true });
    mkdirSync(path.join(globalPrefix, "bin"), { recursive: true });

    const installResult = spawnSync("npm", ["i", "-g", tarballPath, "--dry-run"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        npm_config_prefix: globalPrefix,
      },
    });

    if (installResult.status !== 0) {
      if (installResult.stdout) process.stdout.write(installResult.stdout);
      if (installResult.stderr) process.stderr.write(installResult.stderr);
      throw new Error(
        `npm i -g <remote-tarball> --dry-run failed with status ${installResult.status ?? 1}.`
      );
    }
  } finally {
    removeTarball(tarballPath);
    rmSync(globalPrefix, { recursive: true, force: true });
  }

  process.stdout.write("remote-global-install-dry-run-ok\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runRemoteGlobalInstallDryRun();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
