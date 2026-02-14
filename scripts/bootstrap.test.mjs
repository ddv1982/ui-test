import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import {
  parseArgs,
  resolvePlaywrightVersion,
  runInstallPlaywrightCli,
} from "./bootstrap.mjs";

const mockSpawnSync = vi.mocked(spawnSync);

describe("bootstrap argument parsing", () => {
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
});

describe("bootstrap playwright-cli provisioning", () => {
  let prevCwd = "";
  let tempDir = "";

  beforeEach(async () => {
    vi.resetAllMocks();
    prevCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-bootstrap-test-"));
    process.chdir(tempDir);
    await fs.mkdir(path.join(tempDir, "node_modules", "playwright"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "node_modules", "playwright", "package.json"),
      JSON.stringify({ version: "1.58.2" }, null, 2),
      "utf-8"
    );
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves installed playwright version from node_modules", () => {
    expect(resolvePlaywrightVersion()).toBe("1.58.2");
  });

  it("warns and continues when playwright-cli provisioning fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 1, error: undefined });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("npx -y @playwright/cli@1.58.2 --help")
    );
  });

  it("returns true when playwright-cli provisioning succeeds", () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, error: undefined })
      .mockReturnValueOnce({ status: 0, error: undefined });

    const ok = runInstallPlaywrightCli();
    expect(ok).toBe(true);
  });
});
