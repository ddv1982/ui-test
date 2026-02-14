import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import {
  parseBootstrapArgs,
  registerBootstrap,
  resolveUiTestCliEntry,
  runBootstrap,
  runInstallPlaywrightCli,
} from "./bootstrap.js";

const mockSpawnSync = vi.mocked(spawnSync);

describe("bootstrap command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers bootstrap command", () => {
    const program = new Command();
    registerBootstrap(program);
    const command = program.commands.find((entry) => entry.name() === "bootstrap");
    expect(command).toBeDefined();
  });
});

describe("bootstrap argument parsing", () => {
  it("defaults to quickstart mode", () => {
    const parsed = parseBootstrapArgs([]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      runPlay: false,
      setupArgs: [],
      showHelp: false,
    });
  });

  it("shows bootstrap help for standalone --help", () => {
    const parsed = parseBootstrapArgs(["--help"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      showHelp: true,
    });
  });

  it("parses quickstart flags and setup passthrough args", () => {
    const parsed = parseBootstrapArgs(["quickstart", "--run-play", "--", "--skip-browser-install"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      runPlay: true,
      setupArgs: ["--skip-browser-install"],
      showHelp: false,
    });
  });

  it("passes through setup --help to ui-test setup", () => {
    const parsed = parseBootstrapArgs(["setup", "--help"]);
    expect(parsed).toMatchObject({
      mode: "setup",
      runPlay: false,
      setupArgs: ["--help"],
      showHelp: false,
    });
  });

  it("passes quickstart -- --help through to setup", () => {
    const parsed = parseBootstrapArgs(["quickstart", "--", "--help"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      runPlay: false,
      setupArgs: ["--help"],
      showHelp: false,
    });
  });

  it("rejects unknown quickstart options", () => {
    expect(() => parseBootstrapArgs(["quickstart", "--unknown"])).toThrow(
      /Unknown quickstart option/
    );
  });

  it("rejects install mode with extra args", () => {
    expect(() => parseBootstrapArgs(["install", "extra"])).toThrow(
      /does not accept extra arguments/
    );
  });
});

describe("bootstrap execution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    } as never);
  });

  it("runs quickstart setup and play via current ui-test binary", () => {
    runBootstrap(["quickstart", "--run-play", "--", "--skip-browser-install"]);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [resolveUiTestCliEntry(), "setup", "--skip-browser-install"],
      {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );

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
