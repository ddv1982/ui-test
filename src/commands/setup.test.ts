import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
  },
}));

import { spawnSync } from "node:child_process";
import { UserError } from "../utils/errors.js";
import {
  parseSetupMode,
  registerSetup,
  resolveUiTestCliEntry,
  runSetup,
  runInstallPlaywrightCli,
} from "./setup.js";

const mockSpawnSync = vi.mocked(spawnSync);

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
      [resolveUiTestCliEntry(), "play"],
      {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("runs install mode", async () => {
    await runSetup("install", {});

    expect(mockSpawnSync).toHaveBeenCalledWith("npm", ["ci"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
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
      [resolveUiTestCliEntry(), "play"],
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
