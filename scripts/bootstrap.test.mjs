import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import {
  parseArgs,
  runInstallPlaywrightCli,
} from "./bootstrap.mjs";

const mockSpawnSync = vi.mocked(spawnSync);

describe("bootstrap argument parsing", () => {
  it("shows bootstrap help for standalone --help", () => {
    const parsed = parseArgs(["--help"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      showHelp: true,
    });
  });

  it("defaults to quickstart mode", () => {
    const parsed = parseArgs([]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      runPlay: false,
      setupArgs: [],
      showHelp: false,
    });
  });

  it("parses quickstart flags and setup passthrough args", () => {
    const parsed = parseArgs(["quickstart", "--run-play", "--", "--skip-browser-install"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      runPlay: true,
      setupArgs: ["--skip-browser-install"],
      showHelp: false,
    });
  });

  it("rejects unknown quickstart options", () => {
    expect(() => parseArgs(["quickstart", "--unknown"])).toThrow(/Unknown quickstart option/);
  });

  it("rejects install mode with extra args", () => {
    expect(() => parseArgs(["install", "extra"])).toThrow(/does not accept extra arguments/);
  });

  it("passes through setup --help to ui-test setup", () => {
    const parsed = parseArgs(["setup", "--help"]);
    expect(parsed).toMatchObject({
      mode: "setup",
      showHelp: false,
      setupArgs: ["--help"],
    });
  });

  it("passes quickstart -- --help through to ui-test setup", () => {
    const parsed = parseArgs(["quickstart", "--", "--help"]);
    expect(parsed).toMatchObject({
      mode: "quickstart",
      showHelp: false,
      setupArgs: ["--help"],
    });
  });
});

describe("bootstrap playwright-cli provisioning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when playwright-cli is available on PATH", () => {
    mockSpawnSync.mockReturnValueOnce({ status: 0, error: undefined });

    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenNthCalledWith(1, "playwright-cli", ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      env: process.env,
    });
  });

  it("falls back to npx @latest when playwright-cli is unavailable", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined });

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
  });

  it("warns and continues when both playwright-cli and npx fallback fail", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 1, error: undefined });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Retry manually: playwright-cli --help or npx -y @playwright/cli@latest --help.")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Continuing because Playwright-CLI is only required")
    );
  });
});
