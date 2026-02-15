import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { globby } from "globby";
import {
  PLAY_DEFAULT_ARTIFACTS_DIR,
  PLAY_DEFAULT_BASE_URL,
  PLAY_DEFAULT_DELAY_MS,
  PLAY_DEFAULT_EXAMPLE_TEST_FILE,
  PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
  PLAY_DEFAULT_START_COMMAND,
  PLAY_DEFAULT_TIMEOUT_MS,
  PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "../core/play/play-defaults.js";

vi.mock("globby", () => ({
  globby: vi.fn(),
}));

vi.mock("../core/player.js", () => ({
  play: vi.fn(),
}));

vi.mock("../core/play-failure-report.js", () => ({
  createPlayRunId: vi.fn(() => "run-test-id"),
  writePlayRunReport: vi.fn(async () => "/tmp/run-report.json"),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { play } from "../core/player.js";
import { createPlayRunId, writePlayRunReport } from "../core/play-failure-report.js";
import { spawn } from "node:child_process";
import { registerPlay, runPlay } from "./play.js";

function createMockChildProcess() {
  const child = new EventEmitter() as ChildProcess;
  (child as ChildProcess & { pid: number }).pid = 43210;
  (child as ChildProcess & { exitCode: number | null }).exitCode = null;
  (child as ChildProcess & { killed: boolean }).killed = false;
  (child as ChildProcess & { kill: ReturnType<typeof vi.fn> }).kill = vi
    .fn()
    .mockImplementation(() => {
      (child as ChildProcess & { killed: boolean }).killed = true;
      return true;
    });
  return child;
}

describe("runPlay startup behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(process, "kill").mockReturnValue(true as never);
    vi.mocked(globby).mockResolvedValue([]);
    vi.mocked(createPlayRunId).mockReturnValue("run-test-id");
    vi.mocked(writePlayRunReport).mockResolvedValue("/tmp/run-report.json");
    vi.mocked(play).mockResolvedValue({
      name: "Example Test",
      file: "e2e/example.yaml",
      steps: [],
      passed: true,
      durationMs: 5,
    });
  });

  it("auto-starts by default when startCommand exists", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    await runPlay("e2e/example.yaml", {});

    expect(spawn).toHaveBeenCalledWith(
      PLAY_DEFAULT_START_COMMAND,
      {
        shell: true,
        stdio: "inherit",
        detached: process.platform !== "win32",
      }
    );
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(path.resolve("e2e/example.yaml"), {
      headed: false,
      timeout: PLAY_DEFAULT_TIMEOUT_MS,
      baseUrl: PLAY_DEFAULT_BASE_URL,
      delayMs: PLAY_DEFAULT_DELAY_MS,
      waitForNetworkIdle: PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
      saveFailureArtifacts: PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
      artifactsDir: PLAY_DEFAULT_ARTIFACTS_DIR,
      runId: "run-test-id",
    });
    if (process.platform !== "win32") {
      expect(process.kill).toHaveBeenCalledWith(-43210, "SIGTERM");
    } else {
      expect((child.kill as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "SIGTERM"
      );
    }
  });

  it("ignores invalid ui-test.config.yaml if present", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const originalCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "ui-test-play-"));

    try {
      process.chdir(tempDir);
      await writeFile(
        path.join(tempDir, "ui-test.config.yaml"),
        "headed: true\ntimeout: bad-value\nunknownKey: true\n",
        "utf8"
      );

      await runPlay("e2e/example.yaml", {});
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not auto-start for non-example test files", async () => {
    await runPlay("e2e/nu-nl.yaml", {});

    expect(spawn).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(path.resolve("e2e/nu-nl.yaml"), {
      headed: false,
      timeout: PLAY_DEFAULT_TIMEOUT_MS,
      baseUrl: PLAY_DEFAULT_BASE_URL,
      delayMs: PLAY_DEFAULT_DELAY_MS,
      waitForNetworkIdle: PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
      saveFailureArtifacts: PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
      artifactsDir: PLAY_DEFAULT_ARTIFACTS_DIR,
      runId: "run-test-id",
    });
  });

  it("auto-starts for all-tests run only when discovered set is example-only", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(globby).mockResolvedValue([PLAY_DEFAULT_EXAMPLE_TEST_FILE]);

    await runPlay(undefined, {});

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(path.resolve(PLAY_DEFAULT_EXAMPLE_TEST_FILE), {
      headed: false,
      timeout: PLAY_DEFAULT_TIMEOUT_MS,
      baseUrl: PLAY_DEFAULT_BASE_URL,
      delayMs: PLAY_DEFAULT_DELAY_MS,
      waitForNetworkIdle: PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
      saveFailureArtifacts: PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
      artifactsDir: PLAY_DEFAULT_ARTIFACTS_DIR,
      runId: "run-test-id",
    });
  });

  it("does not auto-start for mixed all-tests run", async () => {
    vi.mocked(globby).mockResolvedValue(["e2e/nu-nl.yaml", PLAY_DEFAULT_EXAMPLE_TEST_FILE]);

    await runPlay(undefined, {});

    expect(spawn).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("skips startup and preflight when --no-start is used", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await runPlay("e2e/example.yaml", { start: false });

    expect(spawn).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("always stops spawned app process when test execution fails", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(play).mockRejectedValue(new Error("boom"));

    await expect(runPlay("e2e/example.yaml", {})).rejects.toThrow("boom");
    if (process.platform !== "win32") {
      expect(process.kill).toHaveBeenCalledWith(-43210, "SIGTERM");
    } else {
      expect((child.kill as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "SIGTERM"
      );
    }
  });

  it("writes run-level failure index when tests fail", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(play).mockResolvedValue({
      name: "Broken Test",
      file: path.resolve("e2e/example.yaml"),
      steps: [
        {
          index: 0,
          step: {
            action: "click",
            target: { value: "#missing", kind: "css", source: "manual" },
          },
          passed: false,
          error: "Element not found",
          durationMs: 10,
        },
      ],
      passed: false,
      durationMs: 10,
      failureArtifacts: {
        runId: "run-test-id",
        testSlug: "e2e-example-yaml-abc12345",
        reportPath: "/tmp/failure-report.json",
        tracePath: "/tmp/trace.zip",
        screenshotPath: "/tmp/failure.png",
      },
    });

    await runPlay("e2e/example.yaml", {});

    expect(writePlayRunReport).toHaveBeenCalledTimes(1);
    expect(writePlayRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-test-id",
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          durationMs: 10,
        },
      }),
      {
        artifactsDir: PLAY_DEFAULT_ARTIFACTS_DIR,
        runId: "run-test-id",
      }
    );
  });

  it("does not write run-level failure index when all tests pass", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    await runPlay("e2e/example.yaml", {});

    expect(writePlayRunReport).not.toHaveBeenCalled();
  });
});

describe("play CLI option parsing", () => {
  it("uses the last network idle flag when both are present", () => {
    const program1 = new Command();
    registerPlay(program1);
    const playCommand1 = program1.commands.find((command) => command.name() === "play");
    expect(playCommand1).toBeDefined();
    playCommand1?.parseOptions(["--wait-network-idle", "--no-wait-network-idle"]);
    expect(playCommand1?.opts().waitNetworkIdle).toBe(false);

    const program2 = new Command();
    registerPlay(program2);
    const playCommand2 = program2.commands.find((command) => command.name() === "play");
    expect(playCommand2).toBeDefined();
    playCommand2?.parseOptions(["--no-wait-network-idle", "--wait-network-idle"]);
    expect(playCommand2?.opts().waitNetworkIdle).toBe(true);
  });

  it("uses the last failure artifact flag when both are present", () => {
    const program1 = new Command();
    registerPlay(program1);
    const playCommand1 = program1.commands.find((command) => command.name() === "play");
    expect(playCommand1).toBeDefined();
    playCommand1?.parseOptions(["--save-failure-artifacts", "--no-save-failure-artifacts"]);
    expect(playCommand1?.opts().saveFailureArtifacts).toBe(false);

    const program2 = new Command();
    registerPlay(program2);
    const playCommand2 = program2.commands.find((command) => command.name() === "play");
    expect(playCommand2).toBeDefined();
    playCommand2?.parseOptions(["--no-save-failure-artifacts", "--save-failure-artifacts"]);
    expect(playCommand2?.opts().saveFailureArtifacts).toBe(true);
  });
});
