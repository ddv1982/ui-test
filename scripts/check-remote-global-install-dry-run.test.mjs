import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    accessSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock("./check-pack-silent.mjs", () => ({
  extractTarballName: vi.fn(),
  removeTarball: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { accessSync, mkdirSync, rmSync } from "node:fs";
import { extractTarballName, removeTarball } from "./check-pack-silent.mjs";
import { runRemoteGlobalInstallDryRun } from "./check-remote-global-install-dry-run.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockAccessSync = vi.mocked(accessSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);
const mockExtractTarballName = vi.mocked(extractTarballName);
const mockRemoveTarball = vi.mocked(removeTarball);

describe("check-remote-global-install-dry-run", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.UI_TEST_REMOTE_PACKAGE_SPEC;
    mockExtractTarballName.mockReturnValue("ui-test-0.1.0.tgz");
    mockSpawnSync.mockImplementation((command, args) => {
      if (command === "npm" && Array.isArray(args) && args[0] === "pack") {
        return { status: 0, stdout: "ui-test-0.1.0.tgz\n", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
  });

  it("packs remote package and validates global install dry-run", () => {
    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockAccessSync).toHaveBeenCalledTimes(1);
    expect(mockMkdirSync).toHaveBeenCalledTimes(3);
    expect(mockRemoveTarball).toHaveBeenCalledTimes(1);
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("uses remote package spec override from environment", () => {
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC = "github:owner/repo#abc123";

    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["pack", "github:owner/repo#abc123", "--silent"],
      expect.objectContaining({ encoding: "utf-8" })
    );
  });

  it("falls back to the https git spec when the default github shorthand pack fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 128,
        stdout: "",
        stderr: "fatal: could not read from remote repository",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "ui-test-0.1.0.tgz\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      });

    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["pack", "github:ddv1982/ui-test", "--silent"],
      expect.objectContaining({ encoding: "utf-8" })
    );
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      "npm",
      ["pack", "git+https://github.com/ddv1982/ui-test.git", "--silent"],
      expect.objectContaining({ encoding: "utf-8" })
    );
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      3,
      "npm",
      ["i", "-g", expect.any(String), "--dry-run"],
      expect.objectContaining({ encoding: "utf-8" })
    );
  });

  it("fails early when remote pack command fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "npm ERR!",
      })
      .mockReturnValueOnce({
        status: 128,
        stdout: "",
        stderr: "fatal: could not read from remote repository",
      });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm pack github:ddv1982\/ui-test --silent failed/
    );
    expect(mockRemoveTarball).not.toHaveBeenCalled();
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it("does not fall back when a custom remote package spec override fails", () => {
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC = "github:owner/repo#abc123";
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm pack github:owner\/repo#abc123 --silent failed/
    );
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("cleans up tarball and temp prefix when install dry-run fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: "ui-test-0.1.0.tgz\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 3,
        stdout: "",
        stderr: "npm ERR!",
      });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm i -g <remote-tarball> --dry-run failed with status 3/
    );
    expect(mockRemoveTarball).toHaveBeenCalledTimes(1);
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });
});
