import type { Command } from "commander";
import { input, confirm } from "@inquirer/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

interface EasyE2EConfig {
  testDir: string;
  baseUrl: string;
  headed: boolean;
  timeout: number;
  delay?: number;
}

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Set up a new easy-e2e test project")
    .action(async () => {
      try {
        await runInit();
      } catch (err) {
        handleError(err);
      }
    });
}

async function runInit() {
  ui.heading("easy-e2e project setup");
  console.log();

  const testDir = await input({
    message: "Where should tests be stored?",
    default: "e2e",
  });

  const baseOrigin = await input({
    message: "What is your application's base URL? (protocol + host)",
    default: "http://localhost",
    validate: validateBaseOrigin,
  });

  const portInput = await input({
    message: "Port (optional, blank to use URL default):",
    default: "3000",
    validate: validatePortInput,
  });

  const baseUrl = buildBaseUrl(baseOrigin, portInput);

  const headed = await confirm({
    message: "Run tests in headed mode by default? (visible browser)",
    default: false,
  });

  const timeout = await input({
    message: "Default step timeout in milliseconds?",
    default: "10000",
    validate: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? true : "Must be a positive number"),
  });

  const delay = await input({
    message: "Delay between steps in milliseconds? (optional, blank for no delay)",
    default: "",
    validate: (v) => {
      if (v.trim().length === 0) return true;
      return !isNaN(Number(v)) && Number(v) >= 0 && Number.isInteger(Number(v))
        ? true
        : "Must be a non-negative integer or blank";
    },
  });

  const config: EasyE2EConfig = {
    testDir,
    baseUrl,
    headed,
    timeout: Number(timeout),
    ...(delay.trim().length > 0 ? { delay: Number(delay) } : {}),
  };

  const configPath = path.resolve("easy-e2e.config.yaml");
  await fs.writeFile(configPath, yaml.dump(config, { quotingType: '"' }), "utf-8");

  await fs.mkdir(path.resolve(testDir), { recursive: true });

  // Create a sample test file
  const samplePath = path.join(path.resolve(testDir), "example.yaml");
  const sampleExists = await fs.access(samplePath).then(() => true).catch(() => false);

  if (!sampleExists) {
    const sample = {
      name: "Example Test",
      description: "A sample test to get you started",
      steps: [
        { action: "navigate", url: "/" },
        {
          action: "assertVisible",
          description: "Page has loaded",
          selector: "body",
        },
      ],
    };
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    ui.step(`Created sample test: ${samplePath}`);
  } else {
    const migrated = await migrateLegacySampleBaseUrl(samplePath);
    if (migrated) {
      ui.step(`Updated sample test to use config baseUrl fallback: ${samplePath}`);
    }
  }

  console.log();
  ui.success(`Config saved to ${configPath}`);
  ui.success(`Test directory created: ${testDir}/`);
  console.log();
  ui.info("Next steps:");
  ui.step("Record a test: npx easy-e2e record");
  ui.step("Run tests: npx easy-e2e play");
  ui.step("List tests: npx easy-e2e list");
}

function validateBaseOrigin(value: string): true | string {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Protocol must be http:// or https://";
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return "Enter only protocol + host (no path/query/hash)";
    }
    return true;
  } catch {
    return "Enter a valid URL like http://localhost or https://example.com";
  }
}

function validatePortInput(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;

  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Port must be blank or an integer between 1 and 65535";
  }
  return true;
}

function buildBaseUrl(baseOrigin: string, portInput: string): string {
  const parsed = new URL(baseOrigin.trim());
  const trimmedPort = portInput.trim();

  if (trimmedPort.length > 0) {
    parsed.port = String(Number(trimmedPort));
  }

  return `${parsed.protocol}//${parsed.host}`;
}

async function migrateLegacySampleBaseUrl(samplePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(samplePath, "utf-8");
    const parsed = yaml.load(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const sample = parsed as Record<string, unknown>;
    if (sample.name !== "Example Test" || !("baseUrl" in sample)) {
      return false;
    }

    delete sample.baseUrl;
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export { buildBaseUrl, validateBaseOrigin, validatePortInput };
