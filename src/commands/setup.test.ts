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
  firefox: {
    launch: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
  },
  webkit: {
    launch: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
  },
}));

vi.mock("@inquirer/prompts", () => ({
  checkbox: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { checkbox } from "@inquirer/prompts";
import { UserError } from "../utils/errors.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../core/play/play-defaults.js";
import {
  parseBrowsersFlag,
  registerSetup,
  resolveUiTestCliEntry,
  runSetup,
} from "./setup.js";
const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockCheckbox = vi.mocked(checkbox);

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

describe("parseBrowsersFlag", () => {
  it("parses single browser", () => {
    expect(parseBrowsersFlag("chromium")).toEqual(["chromium"]);
  });

  it("parses multiple browsers", () => {
    expect(parseBrowsersFlag("chromium,firefox")).toEqual(["chromium", "firefox"]);
  });

  it("deduplicates browsers", () => {
    expect(parseBrowsersFlag("chromium,chromium")).toEqual(["chromium"]);
  });

  it("trims whitespace", () => {
    expect(parseBrowsersFlag(" chromium , firefox ")).toEqual(["chromium", "firefox"]);
  });

  it("rejects empty input", () => {
    expect(() => parseBrowsersFlag("")).toThrow(UserError);
    expect(() => parseBrowsersFlag("")).toThrow(/No browsers specified/);
  });

  it("rejects unknown browsers", () => {
    expect(() => parseBrowsersFlag("chrome")).toThrow(UserError);
    expect(() => parseBrowsersFlag("chrome")).toThrow(/Unknown browser/);
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

  it("runs setup with runPlay when requested", async () => {
    await runSetup({ runPlay: true, browsers: "chromium" });

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
      await runSetup({ runPlay: true, browsers: "chromium" });

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

  it("does not run npm install during setup", async () => {
    await runSetup({ browsers: "chromium" });

    expect(mockSpawnSync).not.toHaveBeenCalledWith(
      "npm",
      expect.anything(),
      expect.anything()
    );
  });

  it("prints next-step help after setup", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetup({ browsers: "chromium" });

    const output = logSpy.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("\n");

    expect(output).toContain("Setup complete.");
    expect(output).toContain("Next:");
    expect(output).toContain("ui-test play");
    expect(output).toContain("ui-test --help");
  });

  it("prints play-help tip after setup --run-play", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetup({ runPlay: true, browsers: "chromium" });

    const output = logSpy.mock.calls
      .map((call) => String(call[0] ?? ""))
      .join("\n");

    expect(output).toContain("Setup complete.");
    expect(output).toContain("Tip: Explore all options with ui-test --help.");
  });

  it("uses interactive prompt when --browsers not provided", async () => {
    mockCheckbox.mockResolvedValue(["chromium"] as never);

    await runSetup({});

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Which browsers do you want to install?",
        required: true,
      })
    );
  });
});

describe("setup command parsing (commander path)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    } as never);
    mockCheckbox.mockResolvedValue(["chromium"] as never);
  });

  it("accepts --browsers chromium --run-play through commander parsing", async () => {
    const program = createProgram();
    await program.parseAsync(
      ["node", "ui-test", "setup", "--browsers", "chromium", "--run-play"],
      { from: "node" }
    );

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

  it("shows setup help without side effects", async () => {
    const program = createProgram();
    getSetupCommand(program).exitOverride();
    await expect(
      program.parseAsync(["node", "ui-test", "setup", "--help"], {
        from: "node",
      })
    ).rejects.toMatchObject({ code: "commander.helpDisplayed" });

    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
