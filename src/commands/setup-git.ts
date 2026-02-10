import type { Command } from "commander";
import { input, confirm } from "@inquirer/prompts";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";

export function registerSetupGit(program: Command) {
  program
    .command("setup-git")
    .description("Set up SSH key and configure git for version control")
    .action(async () => {
      try {
        await runSetupGit();
      } catch (err) {
        handleError(err);
      }
    });
}

async function runSetupGit() {
  ui.heading("Git & SSH setup");
  console.log();

  // Step 1: Check if git is installed
  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
  } catch {
    throw new UserError(
      "Git is not installed.",
      "Install git from https://git-scm.com"
    );
  }

  // Step 2: Configure git user
  const currentName = safeExecFile("git", ["config", "--global", "user.name"]) ?? "";
  const currentEmail = safeExecFile("git", ["config", "--global", "user.email"]) ?? "";

  const name = await input({
    message: "Git user name:",
    default: currentName || undefined,
    validate: (v) => (v.trim().length > 0 ? true : "Name is required"),
  });

  const email = await input({
    message: "Git email:",
    default: currentEmail || undefined,
    validate: (v) => (v.includes("@") ? true : "Enter a valid email"),
  });

  execFileSync("git", ["config", "--global", "user.name", name], { stdio: "pipe" });
  execFileSync("git", ["config", "--global", "user.email", email], { stdio: "pipe" });
  ui.success("Git user configured");

  // Step 3: SSH key
  const sshDir = path.join(os.homedir(), ".ssh");
  const keyPath = path.join(sshDir, "id_ed25519");
  const keyExists = await fs.access(keyPath).then(() => true).catch(() => false);
  let shouldGenerateKey = true;

  if (keyExists) {
    ui.info("SSH key already exists at " + keyPath);
    const regenerate = await confirm({
      message: "Generate a new key? (existing key will not be deleted)",
      default: false,
    });
    if (!regenerate) {
      await showPublicKey(keyPath + ".pub");
      shouldGenerateKey = false;
    }
  } else {
    shouldGenerateKey = await confirm({
      message: "Generate an SSH key for GitHub/GitLab?",
      default: true,
    });
  }

  if (shouldGenerateKey) {
    await fs.mkdir(sshDir, { recursive: true });
    const keyFile = keyExists
      ? path.join(sshDir, `id_ed25519_easy_e2e_${Date.now()}`)
      : keyPath;

    execFileSync("ssh-keygen", ["-t", "ed25519", "-C", email, "-f", keyFile, "-N", ""], {
      stdio: "pipe",
    });
    ui.success(`SSH key generated: ${keyFile}`);
    await showPublicKey(keyFile + ".pub");
  }

  // Step 4: Initialize git repo if not in one
  const inRepo = safeExecFile("git", ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!inRepo) {
    const initRepo = await confirm({
      message: "Initialize a git repository in the current directory?",
      default: true,
    });
    if (initRepo) {
      execFileSync("git", ["init"], { stdio: "pipe" });
      ui.success("Git repository initialized");
    }
  } else {
    ui.info("Already inside a git repository");
  }

  console.log();
  ui.info("Setup complete!");
}

async function showPublicKey(pubKeyPath: string) {
  try {
    const pubKey = (await fs.readFile(pubKeyPath, "utf-8")).trim();
    console.log();
    ui.info("Your public key (add this to GitHub/GitLab):");
    console.log();
    console.log("  " + pubKey);
    console.log();
    ui.dim("GitHub: Settings → SSH and GPG keys → New SSH key");
    ui.dim("GitLab: Preferences → SSH Keys → Add key");
  } catch {
    ui.warn("Could not read public key file");
  }
}

function safeExecFile(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { stdio: "pipe", encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}
