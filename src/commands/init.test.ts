import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import {
  DEFAULT_BASE_ORIGIN,
  DEFAULT_HEADED,
  DEFAULT_INIT_INTENT,
  DEFAULT_PORT,
  DEFAULT_TEST_DIR,
  DEFAULT_TIMEOUT,
  buildBaseUrl,
  buildDefaultStartCommand,
  migrateStockSample,
  runInit,
  validateBaseOrigin,
  validatePortInput,
} from "./init.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("init URL helpers", () => {
  it("uses Vue-first defaults for init prompts", () => {
    expect(DEFAULT_BASE_ORIGIN).toBe("http://127.0.0.1");
    expect(DEFAULT_PORT).toBe("5173");
    expect(DEFAULT_TEST_DIR).toBe("e2e");
    expect(DEFAULT_TIMEOUT).toBe(10_000);
    expect(DEFAULT_HEADED).toBe(false);
    expect(DEFAULT_INIT_INTENT).toBe("example");
    expect(buildDefaultStartCommand("http://127.0.0.1:5173")).toBe(
      "npx ui-test example-app --host 127.0.0.1 --port 5173"
    );
  });

  describe("validateBaseOrigin", () => {
    it("accepts valid http origins", () => {
      expect(validateBaseOrigin("http://localhost")).toBe(true);
      expect(validateBaseOrigin("https://example.com")).toBe(true);
    });

    it("rejects invalid protocols", () => {
      expect(validateBaseOrigin("ftp://localhost")).toMatch(/Protocol must be/);
    });

    it("rejects paths and query fragments", () => {
      expect(validateBaseOrigin("http://localhost/app")).toMatch(/protocol \+ host/i);
      expect(validateBaseOrigin("https://example.com?x=1")).toMatch(/protocol \+ host/i);
    });
  });

  describe("validatePortInput", () => {
    it("accepts blank and valid ports", () => {
      expect(validatePortInput("")).toBe(true);
      expect(validatePortInput("4000")).toBe(true);
    });

    it("rejects invalid port values", () => {
      expect(validatePortInput("0")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("70000")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("abc")).toMatch(/between 1 and 65535/);
    });
  });

  describe("buildBaseUrl", () => {
    it("sets explicit port when provided", () => {
      expect(buildBaseUrl("http://localhost", "4000")).toBe("http://localhost:4000");
    });

    it("keeps default origin port when blank", () => {
      expect(buildBaseUrl("https://example.com", "")).toBe("https://example.com");
      expect(buildBaseUrl("https://example.com:8443", "")).toBe("https://example.com:8443");
    });
  });

  describe("buildDefaultStartCommand", () => {
    it("builds local HTTP example server command", () => {
      expect(buildDefaultStartCommand("http://localhost:4000")).toBe(
        "npx ui-test example-app --host localhost --port 4000"
      );
    });

    it("returns blank for non-local or non-http targets", () => {
      expect(buildDefaultStartCommand("https://example.com")).toBe("");
      expect(buildDefaultStartCommand("http://example.com:3000")).toBe("");
    });
  });
});

describe("migrateStockSample", () => {
  it("migrates stock sample to #app selector and removes baseUrl", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-test-"));
    const samplePath = path.join(dir, "example.yaml");

    const content = `
name: Example Test
baseUrl: http://localhost:3000
steps:
  - action: navigate
    url: /
  - action: assertVisible
    description: Page has loaded
    selector: body
`;

    await fs.writeFile(samplePath, content, "utf-8");

    const migrated = await migrateStockSample(samplePath);
    expect(migrated).toBe(true);

    const updated = await fs.readFile(samplePath, "utf-8");
    expect(updated).not.toContain("baseUrl:");
    expect(updated).toContain('selector: "#app"');
  });
});

describe("runInit --yes", () => {
  it("uses defaults non-interactively and writes expected config and sample", async () => {
    const inputSpy = vi.fn(async () => {
      throw new Error("input prompt should not be called for --yes");
    });
    const confirmSpy = vi.fn(async () => {
      throw new Error("confirm prompt should not be called for --yes");
    });
    const selectSpy = vi.fn(async () => {
      throw new Error("select prompt should not be called for --yes");
    });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-yes-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await runInit({
        yes: true,
        promptApi: {
          input: inputSpy as never,
          confirm: confirmSpy as never,
          select: selectSpy as never,
        },
      });

      expect(inputSpy).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();

      const configPath = path.join(dir, "ui-test.config.yaml");
      const configText = await fs.readFile(configPath, "utf-8");
      const config = yaml.load(configText) as Record<string, unknown>;

      expect(config).toMatchObject({
        testDir: "e2e",
        baseUrl: "http://127.0.0.1:5173",
        startCommand: "npx ui-test example-app --host 127.0.0.1 --port 5173",
        headed: false,
        timeout: 10000,
      });
      expect(config).not.toHaveProperty("delay");

      const samplePath = path.join(dir, "e2e", "example.yaml");
      const sampleText = await fs.readFile(samplePath, "utf-8");
      expect(sampleText).toContain('selector: "#app"');
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites existing sample when overwriteSample is true", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-overwrite-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await fs.mkdir(path.join(dir, "e2e"), { recursive: true });
      await fs.writeFile(
        path.join(dir, "e2e", "example.yaml"),
        `name: "Custom Example"\nsteps:\n  - action: navigate\n    url: "/custom"\n`,
        "utf-8"
      );

      await runInit({ yes: true, overwriteSample: true });

      const samplePath = path.join(dir, "e2e", "example.yaml");
      const sampleText = await fs.readFile(samplePath, "utf-8");
      expect(sampleText).toContain("name: Example Test");
      expect(sampleText).toContain('selector: "#app"');
      expect(sampleText).not.toContain("/custom");
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runInit interactive intents", () => {
  it("uses example intent by default and auto-populates startCommand", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-intent-example-test-"));
    const prevCwd = process.cwd();
    const inputSpy = vi
      .fn()
      .mockResolvedValueOnce("e2e")
      .mockResolvedValueOnce("http://127.0.0.1")
      .mockResolvedValueOnce("5173")
      .mockResolvedValueOnce("10000")
      .mockResolvedValueOnce("");
    const confirmSpy = vi.fn().mockResolvedValue(false);
    const selectSpy = vi.fn().mockResolvedValue("example");

    try {
      process.chdir(dir);
      await runInit({
        promptApi: {
          input: inputSpy as never,
          confirm: confirmSpy as never,
          select: selectSpy as never,
        },
      });

      expect(selectSpy).toHaveBeenCalledTimes(1);
      const selectArg = selectSpy.mock.calls[0]?.[0] as { default?: string };
      expect(selectArg.default).toBe("example");
      expect(inputSpy).toHaveBeenCalledTimes(5);

      const configPath = path.join(dir, "ui-test.config.yaml");
      const configText = await fs.readFile(configPath, "utf-8");
      const config = yaml.load(configText) as Record<string, unknown>;
      expect(config.startCommand).toBe("npx ui-test example-app --host 127.0.0.1 --port 5173");
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("omits startCommand for running-site intent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-intent-running-test-"));
    const prevCwd = process.cwd();
    const inputSpy = vi
      .fn()
      .mockResolvedValueOnce("e2e")
      .mockResolvedValueOnce("http://localhost")
      .mockResolvedValueOnce("3000")
      .mockResolvedValueOnce("10000")
      .mockResolvedValueOnce("");
    const confirmSpy = vi.fn().mockResolvedValue(false);
    const selectSpy = vi.fn().mockResolvedValue("running");

    try {
      process.chdir(dir);
      await runInit({
        promptApi: {
          input: inputSpy as never,
          confirm: confirmSpy as never,
          select: selectSpy as never,
        },
      });

      expect(inputSpy).toHaveBeenCalledTimes(5);

      const configPath = path.join(dir, "ui-test.config.yaml");
      const configText = await fs.readFile(configPath, "utf-8");
      const config = yaml.load(configText) as Record<string, unknown>;
      expect(config).not.toHaveProperty("startCommand");
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("prompts for and stores startCommand for custom intent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-init-intent-custom-test-"));
    const prevCwd = process.cwd();
    const inputSpy = vi
      .fn()
      .mockResolvedValueOnce("e2e")
      .mockResolvedValueOnce("http://localhost")
      .mockResolvedValueOnce("3000")
      .mockResolvedValueOnce("npm run my-app")
      .mockResolvedValueOnce("10000")
      .mockResolvedValueOnce("");
    const confirmSpy = vi.fn().mockResolvedValue(false);
    const selectSpy = vi.fn().mockResolvedValue("custom");

    try {
      process.chdir(dir);
      await runInit({
        promptApi: {
          input: inputSpy as never,
          confirm: confirmSpy as never,
          select: selectSpy as never,
        },
      });

      expect(inputSpy).toHaveBeenCalledTimes(6);

      const configPath = path.join(dir, "ui-test.config.yaml");
      const configText = await fs.readFile(configPath, "utf-8");
      const config = yaml.load(configText) as Record<string, unknown>;
      expect(config.startCommand).toBe("npm run my-app");
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
