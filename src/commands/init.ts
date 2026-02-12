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
  startCommand?: string;
  headed: boolean;
  timeout: number;
  delay?: number;
}

const DEFAULT_BASE_ORIGIN = "http://127.0.0.1";
const DEFAULT_PORT = "5173";

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
    default: DEFAULT_BASE_ORIGIN,
    validate: validateBaseOrigin,
  });

  const portInput = await input({
    message: "Port (optional, blank to use URL default):",
    default: DEFAULT_PORT,
    validate: validatePortInput,
  });

  const baseUrl = buildBaseUrl(baseOrigin, portInput);
  const defaultStartCommand = buildDefaultStartCommand(baseUrl);

  const headed = await confirm({
    message: "Run tests in headed mode by default? (visible browser)",
    default: false,
  });

  const startCommand = await input({
    message: "App start command? (optional, used by `easy-e2e play`)",
    default: defaultStartCommand,
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
    ...(startCommand.trim().length > 0 ? { startCommand: startCommand.trim() } : {}),
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
          description: "App root is visible",
          selector: "#app",
        },
      ],
    };
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    ui.step(`Created sample test: ${samplePath}`);
  } else {
    const migrated = await migrateStockSample(samplePath);
    if (migrated) {
      ui.step(`Updated sample test for current defaults: ${samplePath}`);
    }
  }

  console.log();
  ui.success(`Config saved to ${configPath}`);
  ui.success(`Test directory created: ${testDir}/`);
  console.log();
  ui.info("Next steps:");
  ui.step("Run tests (auto-starts app): npx easy-e2e play");
  if (defaultStartCommand) {
    ui.step(`Manual mode app start: ${defaultStartCommand}`);
  } else {
    ui.step("Manual mode app start: <your app start command>");
  }
  ui.step("Manual mode test run: npx easy-e2e play --no-start");
  ui.step("Record a test: npx easy-e2e record");
  ui.step("List tests: npx easy-e2e list");
  ui.dim("Tip: update easy-e2e.config.yaml baseUrl if your app runs on a different host or port.");
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

function buildDefaultStartCommand(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const isHttp = parsed.protocol === "http:";
    const isLocalHost =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1";

    if (!isHttp || !isLocalHost) {
      return "";
    }

    const port = parsed.port || "80";
    return `npx easy-e2e example-app --host ${parsed.hostname} --port ${port}`;
  } catch {
    return "";
  }
}

async function migrateStockSample(samplePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(samplePath, "utf-8");
    const parsed = yaml.load(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const sample = parsed as Record<string, unknown>;
    if (sample.name !== "Example Test") {
      return false;
    }

    let changed = false;

    if ("baseUrl" in sample) {
      delete sample.baseUrl;
      changed = true;
    }

    const rawSteps = sample.steps;
    if (Array.isArray(rawSteps) && rawSteps.length > 1) {
      const assertVisibleStep = rawSteps[1];
      if (
        assertVisibleStep &&
        typeof assertVisibleStep === "object" &&
        !Array.isArray(assertVisibleStep)
      ) {
        const mutableStep = assertVisibleStep as Record<string, unknown>;
        if (mutableStep.action === "assertVisible" && mutableStep.selector === "body") {
          mutableStep.selector = "#app";
          mutableStep.description = "App root is visible";
          changed = true;
        }
      }
    }

    if (!changed) {
      return false;
    }

    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export {
  DEFAULT_BASE_ORIGIN,
  DEFAULT_PORT,
  buildBaseUrl,
  buildDefaultStartCommand,
  validateBaseOrigin,
  validatePortInput,
  migrateStockSample,
};
