import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  ensureNodeVersion,
  ensureLocalCliBuilt,
  resolveLocalCliEntry,
  runCliSetup,
} from "./setup.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);

function withNodeVersion(version, callback) {
  const original = process.versions.node;
  Object.defineProperty(process.versions, "node", {
    value: version,
    configurable: true,
  });
  try {
    callback();
  } finally {
    Object.defineProperty(process.versions, "node", {
      value: original,
      configurable: true,
    });
  }
}

describe("setup maintainer wrapper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    });
  });

  it("always runs prepare-build before invoking local CLI", () => {
    mockExistsSync.mockReturnValue(true);

    ensureLocalCliBuilt();

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/scripts[\\/]+prepare-build\.mjs$/)],
      {
        cwd: expect.any(String),
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("fails when local CLI entry is still missing after prepare-build", () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => ensureLocalCliBuilt()).toThrow(
      /Local ui-test CLI not found/
    );
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("forwards argv to local ui-test setup entry", () => {
    runCliSetup(["--browsers", "chromium", "--run-play"]);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [resolveLocalCliEntry(), "setup", "--browsers", "chromium", "--run-play"],
      {
        cwd: expect.any(String),
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("accepts Node 20.12 and newer", () => {
    withNodeVersion("20.12.0", () => {
      expect(() => ensureNodeVersion()).not.toThrow();
    });
  });

  it("rejects Node versions below 20.12", () => {
    withNodeVersion("20.11.1", () => {
      expect(() => ensureNodeVersion()).toThrow(/Node\.js 20\.12\+/);
    });
  });
});
