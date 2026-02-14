import type { Command } from "commander";
import * as prompts from "@inquirer/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

interface UITestConfig {
  testDir: string;
  baseUrl: string;
  startCommand?: string;
  headed: boolean;
  timeout: number;
  delay?: number;
}

interface PromptApi {
  input: typeof prompts.input;
  confirm: typeof prompts.confirm;
  select: typeof prompts.select;
}

type InitIntent = "example" | "running" | "custom";

const DEFAULT_BASE_ORIGIN = "http://127.0.0.1";
const DEFAULT_PORT = "5173";
const DEFAULT_TEST_DIR = "e2e";
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_HEADED = false;
const DEFAULT_INIT_INTENT: InitIntent = "example";

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Set up a new ui-test project")
    .option("-y, --yes", "Use defaults without interactive prompts")
    .action(async (opts: unknown) => {
      try {
        await runInit(parseInitOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runInit(
  opts: { yes?: boolean; promptApi?: PromptApi; overwriteSample?: boolean } = {}
) {
  ui.heading("ui-test project setup");
  console.log();

  const useDefaults = opts.yes ?? false;
  const promptApi = opts.promptApi ?? prompts;
  const testDir = useDefaults
    ? DEFAULT_TEST_DIR
    : await promptApi.input({
        message: "Where should tests be stored?",
        default: DEFAULT_TEST_DIR,
      });

  const intent = useDefaults
    ? DEFAULT_INIT_INTENT
    : await promptApi.select<InitIntent>({
        message: "What are you testing?",
        default: DEFAULT_INIT_INTENT,
        choices: [
          { name: "Built-in example app", value: "example" },
          { name: "Already-running website", value: "running" },
          { name: "Custom app with start command", value: "custom" },
        ],
      });

  const baseOrigin = useDefaults
    ? DEFAULT_BASE_ORIGIN
    : await promptApi.input({
        message: "What is your application's base URL? (protocol + host)",
        default: DEFAULT_BASE_ORIGIN,
        validate: validateBaseOrigin,
      });

  const portInput = useDefaults
    ? DEFAULT_PORT
    : await promptApi.input({
        message: "Port (optional, blank to use URL default):",
        default: DEFAULT_PORT,
        validate: validatePortInput,
      });

  const baseUrl = buildBaseUrl(baseOrigin, portInput);
  const defaultStartCommand = buildDefaultStartCommand(baseUrl);

  const headed = useDefaults
    ? DEFAULT_HEADED
    : await promptApi.confirm({
        message: "Run tests in headed mode by default? (visible browser)",
        default: DEFAULT_HEADED,
      });

  const startCommand =
    intent === "example"
      ? defaultStartCommand
      : intent === "custom"
        ? await promptApi.input({
            message: "App start command? (required for auto-start with `ui-test play`)",
            default: defaultStartCommand,
            validate: (v) => (v.trim().length > 0 ? true : "Start command is required"),
          })
        : "";

  const timeoutInput = useDefaults
    ? String(DEFAULT_TIMEOUT)
    : await promptApi.input({
        message: "Default step timeout in milliseconds?",
        default: String(DEFAULT_TIMEOUT),
        validate: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? true : "Must be a positive number"),
      });

  const delayInput = useDefaults
    ? ""
    : await promptApi.input({
        message: "Delay between steps in milliseconds? (optional, blank for no delay)",
        default: "",
        validate: (v) => {
          if (v.trim().length === 0) return true;
          return !isNaN(Number(v)) && Number(v) >= 0 && Number.isInteger(Number(v))
            ? true
            : "Must be a non-negative integer or blank";
        },
      });

  const config: UITestConfig = {
    testDir,
    baseUrl,
    ...(startCommand.trim().length > 0 ? { startCommand: startCommand.trim() } : {}),
    headed,
    timeout: Number(timeoutInput),
    ...(delayInput.trim().length > 0 ? { delay: Number(delayInput) } : {}),
  };

  const configPath = path.resolve("ui-test.config.yaml");
  await fs.writeFile(configPath, yaml.dump(config, { quotingType: '"' }), "utf-8");

  await fs.mkdir(path.resolve(testDir), { recursive: true });

  // Create a sample test file
  const samplePath = path.join(path.resolve(testDir), "example.yaml");
  const sampleExists = await fs.access(samplePath).then(() => true).catch(() => false);
  const sample = {
    name: "Example Test",
    description: "A sample test to get you started",
    steps: [
      { action: "navigate", url: "/" },
      {
        action: "assertVisible",
        description: "App root is visible",
        target: {
          value: "#app",
          kind: "css",
          source: "manual",
        },
      },
    ],
  };

  if (opts.overwriteSample) {
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    ui.step(`Reset sample test with defaults: ${samplePath}`);
  } else if (!sampleExists) {
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
  if (config.startCommand) {
    ui.step("Run tests (auto-starts app): ui-test play");
    ui.step(`Manual mode app start: ${config.startCommand}`);
    ui.step("Manual mode test run: ui-test play --no-start");
  } else {
    ui.step("Start your app manually.");
    ui.step("Run tests against running app: ui-test play --no-start");
    ui.dim(
      "Tip: `ui-test play` without --no-start expects `startCommand` in config or a reachable baseUrl."
    );
  }
  ui.step("Record a test: ui-test record");
  ui.step("List tests: ui-test list");
  ui.dim("Tip: update ui-test.config.yaml baseUrl if your app runs on a different host or port.");
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
    const localOrGlobalCommand = `ui-test example-app --host ${parsed.hostname} --port ${port}`;
    const oneOffFallbackCommand =
      `npx -y github:ddv1982/easy-e2e-testing example-app --host ${parsed.hostname} --port ${port}`;
    return `${localOrGlobalCommand} || ${oneOffFallbackCommand}`;
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
    if (isUnknownArray(rawSteps) && rawSteps.length > 1) {
      const assertVisibleStep = rawSteps[1];
      if (
        assertVisibleStep &&
        typeof assertVisibleStep === "object" &&
        !Array.isArray(assertVisibleStep)
      ) {
        const mutableStep = assertVisibleStep as Record<string, unknown>;
        if (mutableStep.action === "assertVisible" && mutableStep.selector === "body") {
          delete mutableStep.selector;
          mutableStep.target = {
            value: "#app",
            kind: "css",
            source: "manual",
          };
          mutableStep.description = "App root is visible";
          changed = true;
        } else if (
          mutableStep.action === "assertVisible" &&
          !mutableStep.target &&
          mutableStep.selector === "#app"
        ) {
          delete mutableStep.selector;
          mutableStep.target = {
            value: "#app",
            kind: "css",
            source: "manual",
          };
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

function parseInitOptions(value: unknown): {
  yes?: boolean;
  promptApi?: PromptApi;
  overwriteSample?: boolean;
} {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    yes: asOptionalBoolean(record.yes),
    promptApi: isPromptApi(record.promptApi) ? record.promptApi : undefined,
    overwriteSample: asOptionalBoolean(record.overwriteSample),
  };
}

function isPromptApi(value: unknown): value is PromptApi {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.input === "function" &&
    typeof record.confirm === "function" &&
    typeof record.select === "function"
  );
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export {
  DEFAULT_BASE_ORIGIN,
  DEFAULT_PORT,
  DEFAULT_TEST_DIR,
  DEFAULT_TIMEOUT,
  DEFAULT_HEADED,
  DEFAULT_INIT_INTENT,
  buildBaseUrl,
  buildDefaultStartCommand,
  validateBaseOrigin,
  validatePortInput,
  migrateStockSample,
  runInit,
};
