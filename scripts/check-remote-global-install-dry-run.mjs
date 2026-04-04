import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REMOTE_PACKAGE_SPEC = "github:ddv1982/ui-test";
const DEFAULT_REMOTE_PACKAGE_FALLBACK_SPEC = "git+https://github.com/ddv1982/ui-test.git";

function runRemoteGlobalInstallDryRunCommand(
  remotePackageSpec,
  globalPrefix,
  installWorkdir
) {
  return spawnSync("npm", ["i", "-g", remotePackageSpec, "--dry-run"], {
    cwd: installWorkdir,
    encoding: "utf-8",
    env: {
      ...process.env,
      npm_config_prefix: globalPrefix,
    },
  });
}

export function runRemoteGlobalInstallDryRun() {
  const remotePackageSpec =
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC?.trim() ||
    DEFAULT_REMOTE_PACKAGE_SPEC;

  const globalPrefix = path.join(
    os.tmpdir(),
    `ui-test-remote-global-install-${process.pid}-${Date.now()}`
  );
  const installWorkdir = path.join(globalPrefix, "cwd");

  try {
    mkdirSync(globalPrefix, { recursive: true });
    mkdirSync(path.join(globalPrefix, "lib"), { recursive: true });
    mkdirSync(path.join(globalPrefix, "bin"), { recursive: true });
    mkdirSync(installWorkdir, { recursive: true });

    let installResult = runRemoteGlobalInstallDryRunCommand(
      remotePackageSpec,
      globalPrefix,
      installWorkdir
    );
    if (
      !process.env.UI_TEST_REMOTE_PACKAGE_SPEC &&
      installResult.status !== 0 &&
      remotePackageSpec === DEFAULT_REMOTE_PACKAGE_SPEC
    ) {
      installResult = runRemoteGlobalInstallDryRunCommand(
        DEFAULT_REMOTE_PACKAGE_FALLBACK_SPEC,
        globalPrefix,
        installWorkdir
      );
    }

    if (installResult.status !== 0) {
      if (installResult.stdout) process.stdout.write(installResult.stdout);
      if (installResult.stderr) process.stderr.write(installResult.stderr);
      throw new Error(
        `npm i -g ${remotePackageSpec} --dry-run failed with status ${installResult.status ?? 1}.`
      );
    }
  } finally {
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
