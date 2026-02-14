import path from "node:path";
import type { Command } from "commander";
import { collectRuntimeInfo } from "../utils/runtime-info.js";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Show runtime diagnostics for CLI version and invocation")
    .action(async () => {
      try {
        await runDoctor();
      } catch (err) {
        handleError(err);
      }
    });
}

export async function runDoctor(): Promise<void> {
  const info = collectRuntimeInfo();
  const localEntrypoint = info.localPackageRoot
    ? path.join(info.localPackageRoot, "dist", "bin", "ui-test.js")
    : undefined;
  const recommendedDoctorCommand = localEntrypoint
    ? `node ${localEntrypoint} doctor`
    : "npx ui-test doctor";

  ui.heading("ui-test doctor");
  console.log();
  ui.info(`CLI version: ${info.cliVersion}`);
  ui.info(`Node version: ${info.nodeVersion}`);
  ui.info(`Working directory: ${info.cwd}`);
  ui.info(`Workspace root: ${info.workspaceRoot}`);
  ui.info(
    `Binary invocation: ${info.invocation.resolvedInvocationPath ?? info.invocation.rawInvocation ?? "(unknown)"}`
  );
  ui.info(`Invocation classification: ${info.invocation.classification}`);
  ui.info(`Local ui-test package version (workspace): ${info.localPackageVersion ?? "(not found)"}`);

  if (info.invocation.classification === "outside-workspace") {
    ui.warn(
      `Invoked binary appears outside current workspace. For consistent behavior, run: ${recommendedDoctorCommand}`
    );
  }

  if (info.invocation.classification === "unverifiable" && info.invocation.rawInvocation) {
    ui.warn(
      `Could not verify binary path from invocation (${info.invocation.rawInvocation}). For consistent behavior, run: ${recommendedDoctorCommand}`
    );
  }

  if (
    info.localPackageVersion &&
    info.localPackageVersion !== info.cliVersion
  ) {
    ui.warn(
      `Version mismatch detected: running CLI=${info.cliVersion}, local package=${info.localPackageVersion}.`
    );
    ui.step(`Use local build explicitly: ${recommendedDoctorCommand}`);
  }
}
