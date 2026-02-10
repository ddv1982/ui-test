import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises");

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should load valid YAML config", async () => {
    const configContent = `
testDir: e2e-tests
baseUrl: https://example.com
headed: true
timeout: 5000
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "e2e-tests",
      baseUrl: "https://example.com",
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
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("should return defaults when config is invalid YAML", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: content:");

    const config = await loadConfig();

    expect(config).toEqual({});
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
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config.testDir).toBe("integration-tests");
    expect(config.baseUrl).toBe("https://staging.example.com");
    expect(config.headed).toBe(false);
    expect(config.timeout).toBe(15000);
  });
});
