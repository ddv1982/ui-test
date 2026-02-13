import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { UserError } from "./errors.js";

const llmConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["ollama"]).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

const configSchema = z.object({
  testDir: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  startCommand: z.string().min(1).optional(),
  headed: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  delay: z.number().int().nonnegative().optional(),
  waitForNetworkIdle: z.boolean().optional(),
  networkIdleTimeout: z.number().int().positive().optional(),
  saveFailureArtifacts: z.boolean().optional(),
  artifactsDir: z.string().min(1).optional(),
  recordSelectorPolicy: z.enum(["reliable", "raw"]).optional(),
  recordBrowser: z.enum(["chromium", "firefox", "webkit"]).optional(),
  recordDevice: z.string().min(1).optional(),
  recordTestIdAttribute: z.string().min(1).optional(),
  recordLoadStorage: z.string().min(1).optional(),
  recordSaveStorage: z.string().min(1).optional(),
  improveProvider: z.enum(["auto", "playwright", "playwright-cli"]).optional(),
  improveApplyMode: z.enum(["review", "apply"]).optional(),
  improveApplyAssertions: z.boolean().optional(),
  improveAssertions: z.enum(["none", "candidates"]).optional(),
  llm: llmConfigSchema.optional(),
});

export type UITestConfig = z.infer<typeof configSchema>;

const CONFIG_FILENAMES = ["ui-test.config.yaml"];
const LEGACY_CONFIG_FILENAMES = ["easy-e2e.config.yaml", "easy-e2e.config.yml"];

export async function loadConfig(): Promise<UITestConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.resolve(filename);
    let content: string;

    try {
      content = await fs.readFile(configPath, "utf-8");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";

      if (code === "ENOENT" || message.includes("ENOENT")) {
        continue;
      }

      throw new UserError(
        `Failed to read config file: ${filename}`,
        "Check file permissions and try again."
      );
    }

    let parsedYaml: unknown;

    try {
      parsedYaml = yaml.load(content);
    } catch {
      throw new UserError(
        `Invalid YAML syntax in ${filename}`,
        "Fix YAML syntax in the config file and try again."
      );
    }

    if (parsedYaml == null) return {};

    const parsedConfig = configSchema.safeParse(parsedYaml);
    if (!parsedConfig.success) {
      const issues = parsedConfig.error.issues
        .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
        .join("; ");

      throw new UserError(
        `Invalid config in ${filename}: ${issues}`,
        "Expected shape: { testDir?: string, baseUrl?: URL, startCommand?: string, headed?: boolean, timeout?: positive integer, delay?: non-negative integer, waitForNetworkIdle?: boolean, networkIdleTimeout?: positive integer, saveFailureArtifacts?: boolean, artifactsDir?: string, recordSelectorPolicy?: 'reliable'|'raw', recordBrowser?: 'chromium'|'firefox'|'webkit', recordDevice?: string, recordTestIdAttribute?: string, recordLoadStorage?: string, recordSaveStorage?: string, improveProvider?: 'auto'|'playwright'|'playwright-cli', improveApplyMode?: 'review'|'apply', improveApplyAssertions?: boolean, improveAssertions?: 'none'|'candidates', llm?: { enabled?: boolean, provider?: 'ollama', baseUrl?: URL, model?: string, timeoutMs?: positive integer, temperature?: 0..2, maxOutputTokens?: positive integer } }."
      );
    }

    return parsedConfig.data;
  }

  const legacyConfigPath = await findLegacyConfigPath();
  if (legacyConfigPath) {
    throw new UserError(
      `Legacy config file detected: ${legacyConfigPath}`,
      "Rename it to ui-test.config.yaml. Legacy easy-e2e config filenames are no longer supported."
    );
  }

  // No config file found — use defaults
  return {};
}

export async function findLegacyConfigPath(): Promise<string | undefined> {
  for (const filename of LEGACY_CONFIG_FILENAMES) {
    const configPath = path.resolve(filename);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // Keep checking.
    }
  }
  return undefined;
}
