import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { runRemoteGlobalInstallDryRun } from "./check-remote-global-install-dry-run.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);

describe("check-remote-global-install-dry-run", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.UI_TEST_REMOTE_PACKAGE_SPEC;
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
  });

  it("packs remote package and validates global install dry-run", () => {
    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockMkdirSync).toHaveBeenCalledTimes(4);
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("uses remote package spec override from environment", () => {
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC = "github:owner/repo#abc123";

    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["i", "-g", "github:owner/repo#abc123"],
      expect.objectContaining({
        cwd: expect.any(String),
        encoding: "utf-8",
        env: expect.objectContaining({
          npm_config_prefix: expect.any(String),
        }),
      })
    );
  });

  it("uses the https git spec by default", () => {
    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["i", "-g", "git+https://github.com/ddv1982/ui-test.git"],
      expect.objectContaining({
        cwd: expect.any(String),
        encoding: "utf-8",
        env: expect.objectContaining({
          npm_config_prefix: expect.any(String),
        }),
      })
    );
  });

  it("runs remote install checks from an isolated temp cwd", () => {
    runRemoteGlobalInstallDryRun();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "npm",
        ["i", "-g", "git+https://github.com/ddv1982/ui-test.git"],
        expect.objectContaining({
          cwd: expect.stringMatching(/ui-test-remote-global-install-.*\/cwd$/),
        })
    );
  });

  it("fails early when remote pack command fails", () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm i -g git\+https:\/\/github.com\/ddv1982\/ui-test.git failed/
    );
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when a custom remote package spec override fails", () => {
    process.env.UI_TEST_REMOTE_PACKAGE_SPEC = "github:owner/repo#abc123";
    mockSpawnSync.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm i -g github:owner\/repo#abc123 failed/
    );
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("cleans up temp prefix when install dry-run fails", () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 3,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runRemoteGlobalInstallDryRun()).toThrow(
      /npm i -g git\+https:\/\/github.com\/ddv1982\/ui-test.git failed with status 3/
    );
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });
});
