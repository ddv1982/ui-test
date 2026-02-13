import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import * as fs from "node:fs/promises";
import { UserError } from "./errors.js";

vi.mock("node:fs/promises");

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });

  it("should load valid YAML config", async () => {
    const configContent = `
testDir: e2e-tests
baseUrl: https://example.com
headed: true
timeout: 5000
startCommand: npm run dev
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "e2e-tests",
      baseUrl: "https://example.com",
      startCommand: "npm run dev",
      headed: true,
      timeout: 5000,
    });
  });

  it("should load config from .yaml extension", async () => {
    const configContent = `
testDir: tests
baseUrl: http://localhost:3000
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toHaveProperty("testDir", "tests");
    expect(config).toHaveProperty("baseUrl", "http://localhost:3000");
  });

  it("should return defaults when config file not found", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("should reject legacy easy-e2e config filenames", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const file = String(filePath);
      if (file.endsWith("ui-test.config.yaml")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    vi.mocked(fs.access).mockImplementation(async (filePath) => {
      const file = String(filePath);
      if (file.endsWith("easy-e2e.config.yaml")) {
        return undefined;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const run = loadConfig();
    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(/Legacy config file detected/);
  });

  it("should return defaults when config is invalid YAML", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: content:");

    await expect(loadConfig()).rejects.toBeInstanceOf(UserError);
  });

  it("should handle partial config", async () => {
    const configContent = `
testDir: my-tests
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "my-tests",
    });
  });

  it("should handle empty config file", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("");

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("should handle config with all optional fields", async () => {
    const configContent = `
testDir: integration-tests
baseUrl: https://staging.example.com
headed: false
timeout: 15000
delay: 2000
waitForNetworkIdle: false
networkIdleTimeout: 3500
saveFailureArtifacts: true
artifactsDir: ".ui-test-artifacts"
recordSelectorPolicy: reliable
recordBrowser: firefox
recordDevice: "iPhone 13"
recordTestIdAttribute: "data-qa"
recordLoadStorage: ".auth/in.json"
recordSaveStorage: ".auth/out.json"
improveProvider: playwright-cli
improveApplyMode: review
improveApplyAssertions: true
improveAssertions: candidates
llm:
  enabled: true
  provider: ollama
  baseUrl: http://127.0.0.1:11434
  model: gemma3:4b
  timeoutMs: 12000
  temperature: 0
  maxOutputTokens: 600
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config.testDir).toBe("integration-tests");
    expect(config.baseUrl).toBe("https://staging.example.com");
    expect(config.headed).toBe(false);
    expect(config.timeout).toBe(15000);
    expect(config.delay).toBe(2000);
    expect(config.waitForNetworkIdle).toBe(false);
    expect(config.networkIdleTimeout).toBe(3500);
    expect(config.saveFailureArtifacts).toBe(true);
    expect(config.artifactsDir).toBe(".ui-test-artifacts");
    expect(config.recordSelectorPolicy).toBe("reliable");
    expect(config.recordBrowser).toBe("firefox");
    expect(config.recordDevice).toBe("iPhone 13");
    expect(config.recordTestIdAttribute).toBe("data-qa");
    expect(config.recordLoadStorage).toBe(".auth/in.json");
    expect(config.recordSaveStorage).toBe(".auth/out.json");
    expect(config.improveProvider).toBe("playwright-cli");
    expect(config.improveApplyMode).toBe("review");
    expect(config.improveApplyAssertions).toBe(true);
    expect(config.improveAssertions).toBe("candidates");
    expect(config.llm).toEqual({
      enabled: true,
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      timeoutMs: 12000,
      temperature: 0,
      maxOutputTokens: 600,
    });
  });

  it("should reject invalid config types", async () => {
    const configContent = `
timeout: "5000"
headed: yes
delay: -1
startCommand: 123
waitForNetworkIdle: "true"
networkIdleTimeout: 0
saveFailureArtifacts: "yes"
artifactsDir: 123
recordSelectorPolicy: fast
recordBrowser: safari
improveProvider: cli
improveApplyMode: merge
improveApplyAssertions: "yes"
improveAssertions: all
llm:
  provider: unknown
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    await expect(loadConfig()).rejects.toBeInstanceOf(UserError);
  });
});
