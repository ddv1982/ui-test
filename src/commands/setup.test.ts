import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
  },
}));

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { UserError } from "../utils/errors.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../core/play/play-defaults.js";
import {
  parseSetupMode,
  registerSetup,
  resolveUiTestCliEntry,
  runSetup,
  runInstallPlaywrightCli,
} from "./setup.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);

function createProgram(): Command {
  const program = new Command();
  registerSetup(program);
  return program;
}

function getSetupCommand(program: Command): Command {
  const command = program.commands.find((entry) => entry.name() === "setup");
  if (!command) {
    throw new Error("setup command is not registered");
  }
  return command;
}

describe("setup command registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers setup command", () => {
    const program = createProgram();
    expect(getSetupCommand(program)).toBeDefined();
  });
});

describe("setup mode parsing", () => {
  it("defaults to quickstart for empty mode", () => {
    expect(parseSetupMode(undefined)).toBe("quickstart");
    expect(parseSetupMode("")).toBe("quickstart");
  });

  it("accepts install and quickstart", () => {
    expect(parseSetupMode("install")).toBe("install");
    expect(parseSetupMode("quickstart")).toBe("quickstart");
  });

  it("rejects unknown mode", () => {
    expect(() => parseSetupMode("init")).toThrow(UserError);
    expect(() => parseSetupMode("init")).toThrow(/Unknown mode: init/);
  });
});

describe("setup execution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    } as never);
  });

  it("runs quickstart with runPlay when requested", async () => {
    await runSetup("quickstart", { runPlay: true });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [resolveUiTestCliEntry(), "play", PLAY_DEFAULT_EXAMPLE_TEST_FILE],
      {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("skips runPlay with warning when example test file is missing", async () => {
    mockExistsSync.mockImplementation((targetPath) => {
      const value = String(targetPath);
      if (value.endsWith(PLAY_DEFAULT_EXAMPLE_TEST_FILE)) {
        return false;
      }
      return true;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await runSetup("quickstart", { runPlay: true });

      expect(mockSpawnSync).not.toHaveBeenCalledWith(
        process.execPath,
        [resolveUiTestCliEntry(), "play", PLAY_DEFAULT_EXAMPLE_TEST_FILE],
        expect.anything()
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping run-play because e2e/example.yaml was not found")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("runs install mode", async () => {
    await runSetup("install", {});

    expect(mockSpawnSync).toHaveBeenCalledWith("npm", ["ci"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
  });

  it("prints next-step help after quickstart", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetup("quickstart", {});

    const output = logSpy.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("\n");

    expect(output).toContain("✔ Setup complete.");
    expect(output).toContain("Next:");
    expect(output).toContain("ui-test play");
    expect(output).toContain("ui-test --help");
  });

  it("prints play-help tip after quickstart --run-play", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetup("quickstart", { runPlay: true });

    const output = logSpy.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("\n");

    expect(output).toContain("✔ Setup complete.");
    expect(output).toContain("Tip: Explore all options with ui-test --help.");
  });

  it("rejects install mode with --run-play", async () => {
    const run = runSetup("install", { runPlay: true });
    await expect(run).rejects.toThrow(UserError);
    await expect(run).rejects.toThrow("install mode does not support --run-play.");
  });
});

describe("setup command parsing (commander path)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    } as never);
  });

  it("accepts quickstart --run-play through commander parsing", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "ui-test", "setup", "quickstart", "--run-play"], {
      from: "node",
    });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [resolveUiTestCliEntry(), "play", PLAY_DEFAULT_EXAMPLE_TEST_FILE],
      {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("shows top-level setup help without side effects", async () => {
    const program = createProgram();
    getSetupCommand(program).exitOverride();
    await expect(
      program.parseAsync(["node", "ui-test", "setup", "--help"], {
        from: "node",
      })
    ).rejects.toMatchObject({ code: "commander.helpDisplayed" });

    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("shows quickstart help without side effects", async () => {
    const program = createProgram();
    getSetupCommand(program).exitOverride();
    await expect(
      program.parseAsync(["node", "ui-test", "setup", "quickstart", "--help"], {
        from: "node",
      })
    ).rejects.toMatchObject({ code: "commander.helpDisplayed" });

    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});

describe("setup playwright-cli provisioning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("warns and continues when playwright-cli provisioning fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 1, error: undefined });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(false);
    expect(mockSpawnSync).toHaveBeenNthCalledWith(1, "playwright-cli", ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      env: process.env,
    });
    expect(mockSpawnSync).toHaveBeenNthCalledWith(2, "npx", ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      env: process.env,
    });
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      3,
      "npx",
      ["-y", "@playwright/cli@latest", "--version"],
      {
        stdio: "ignore",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Retry manually: playwright-cli --help or npx -y @playwright/cli@latest --help.")
    );
  });

  it("falls back to npx @latest when playwright-cli is unavailable", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(true);
    expect(mockSpawnSync).toHaveBeenNthCalledWith(1, "playwright-cli", ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      env: process.env,
    });
    expect(mockSpawnSync).toHaveBeenNthCalledWith(2, "npx", ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      env: process.env,
    });
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      3,
      "npx",
      ["-y", "@playwright/cli@latest", "--version"],
      {
        stdio: "ignore",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
