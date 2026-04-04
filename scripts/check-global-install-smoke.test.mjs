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

vi.mock("./check-pack-silent.mjs", () => ({
  packCurrentWorkspaceSilent: vi.fn(),
  removeTarball: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { packCurrentWorkspaceSilent, removeTarball } from "./check-pack-silent.mjs";
import { runGlobalInstallSmokeCheck } from "./check-global-install-smoke.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);
const mockPackCurrentWorkspaceSilent = vi.mocked(packCurrentWorkspaceSilent);
const mockRemoveTarball = vi.mocked(removeTarball);

describe("check-global-install-smoke", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPackCurrentWorkspaceSilent.mockReturnValue("/tmp/ui-test-0.1.0.tgz");
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("installs the tarball globally and runs the installed cli help", () => {
    runGlobalInstallSmokeCheck();

    expect(mockMkdirSync).toHaveBeenCalledTimes(4);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["i", "-g", "/tmp/ui-test-0.1.0.tgz"],
      expect.objectContaining({
        cwd: expect.stringMatching(/ui-test-global-install-smoke-.*\/cwd$/),
        encoding: "utf-8",
        env: expect.objectContaining({
          npm_config_prefix: expect.any(String),
        }),
      })
    );
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/ui-test(?:\.cmd)?$/),
      ["--help"],
      expect.objectContaining({
        cwd: expect.stringMatching(/ui-test-global-install-smoke-.*\/cwd$/),
        encoding: "utf-8",
      })
    );
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("cleans up when the global install fails", () => {
    mockSpawnSync.mockReturnValueOnce({
      status: 2,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runGlobalInstallSmokeCheck()).toThrow(
      /npm i -g <tarball> failed with status 2/
    );
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("cleans up when the installed cli help command fails", () => {
    mockSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "usage failed",
      });

    expect(() => runGlobalInstallSmokeCheck()).toThrow(
      /Installed ui-test --help failed with status 1/
    );
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });
});
