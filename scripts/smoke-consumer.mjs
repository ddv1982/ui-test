import { spawnSync } from "node:child_process";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function runStep(name, command, args, cwd, options = {}) {
  const printStdout = options.printStdout ?? true;
  const stdio = options.stdio ?? "pipe";

  console.log(`\n[smoke] ${name}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio,
    env: process.env,
  });

  const stdoutText = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderrText = typeof result.stderr === "string" ? result.stderr.trim() : "";

  if (printStdout && stdoutText) {
    console.log(stdoutText);
  }

  if (result.status !== 0) {
    if (stderrText) {
      console.error(stderrText);
    }

    throw new Error(
      `${name} failed (${command} ${args.join(" ")}) with exit code ${result.status ?? "unknown"}`
    );
  }

  return typeof result.stdout === "string" ? result.stdout : "";
}

async function main() {
  let workspace = "";
  let tarballPath = "";

  try {
    workspace = await mkdtemp(path.join(tmpdir(), "easy-e2e-smoke-"));

    const packRaw = runStep(
      "Pack local package",
      "npm",
      ["pack", "--json"],
      repoRoot,
      { printStdout: false }
    );

    const packed = JSON.parse(packRaw);
    if (!Array.isArray(packed) || packed.length === 0 || !packed[0].filename) {
      throw new Error("Failed to parse npm pack output.");
    }

    tarballPath = path.join(repoRoot, String(packed[0].filename));

    runStep("Create temp workspace", "npm", ["init", "-y"], workspace);
    runStep("Install packed CLI", "npm", ["install", "--save-dev", tarballPath], workspace);
    runStep(
      "Install Playwright Chromium",
      "npx",
      ["playwright", "install", "chromium"],
      workspace,
      { printStdout: false, stdio: "inherit" }
    );
    runStep("Initialize config with defaults", "npx", ["easy-e2e", "init", "--yes"], workspace);
    runStep("Run YAML browser test", "npx", ["easy-e2e", "play"], workspace);

    console.log("\n[smoke] Consumer smoke test passed.");
  } finally {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }

    if (tarballPath) {
      await unlink(tarballPath).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(`\n[smoke] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
