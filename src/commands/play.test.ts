import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../utils/errors.js";

vi.mock("globby", () => ({
  globby: vi.fn(),
}));

vi.mock("../core/player.js", () => ({
  play: vi.fn(),
}));

vi.mock("../utils/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { play } from "../core/player.js";
import { loadConfig } from "../utils/config.js";
import { spawn } from "node:child_process";
import { runPlay } from "./play.js";

function createMockChildProcess() {
  const child = new EventEmitter() as ChildProcess;
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.mocked(loadConfig).mockResolvedValue({
      testDir: "e2e",
      baseUrl: "http://127.0.0.1:5173",
      startCommand: "npx easy-e2e example-app --host 127.0.0.1 --port 5173",
      timeout: 10000,
      delay: 0,
      headed: false,
    });
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

    expect(spawn).toHaveBeenCalledWith("npx easy-e2e example-app --host 127.0.0.1 --port 5173", {
      shell: true,
      stdio: "inherit",
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("skips startup when --no-start is used", async () => {
    await runPlay("e2e/example.yaml", { start: false });

    expect(spawn).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("fails fast when baseUrl is unreachable in no-start mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const run = runPlay("e2e/example.yaml", { start: false });
    await expect(run).rejects.toThrow(UserError);
    await expect(run).rejects.toThrow(
      /Cannot reach app/
    );
    expect(play).not.toHaveBeenCalled();
  });

  it("always stops spawned app process when test execution fails", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(play).mockRejectedValue(new Error("boom"));

    await expect(runPlay("e2e/example.yaml", {})).rejects.toThrow("boom");
    expect((child.kill as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "SIGTERM"
    );
  });

  it("allows auto-start without baseUrl when tests use absolute URLs", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(loadConfig).mockResolvedValue({
      testDir: "e2e",
      startCommand: "npx easy-e2e example-app --host 127.0.0.1 --port 5173",
      timeout: 10000,
      delay: 0,
      headed: false,
    });

    await runPlay("e2e/example.yaml", {});

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
