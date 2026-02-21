import { spawn, type SpawnOptions } from "node:child_process";

export interface InteractiveCommandResult {
  exitCode?: number;
  signal?: NodeJS.Signals | null;
}

export interface RunCapturedOptions {
  timeoutMs: number;
  killGraceMs?: number;
  spawnOptions?: SpawnOptions;
}

export interface CapturedCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

const DEFAULT_KILL_GRACE_MS = 2_000;

export function runInteractiveCommand(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<InteractiveCommandResult> {
  return new Promise((resolve, reject) => {
    const child = options ? spawn(command, args, options) : spawn(command, args);

    child.on("error", (err: Error) => reject(err));
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === null) {
        resolve({ signal });
        return;
      }
      resolve({ exitCode: code, signal });
    });
  });
}

export function runCapturedCommand(
  command: string,
  args: string[],
  options: RunCapturedOptions
): Promise<CapturedCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options.spawnOptions,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: CapturedCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      resolve(result);
    };

    const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;

    const timeoutTimer = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
        settle({
          ok: false,
          stdout,
          stderr,
          error: `Command timed out after ${options.timeoutMs + killGraceMs}ms`,
        });
      }, killGraceMs);
    }, options.timeoutMs);
    let killTimer: NodeJS.Timeout | undefined;

    child.stdout?.on("data", (chunk: unknown) => {
      stdout += chunkToString(chunk);
    });

    child.stderr?.on("data", (chunk: unknown) => {
      stderr += chunkToString(chunk);
    });

    child.on("error", (err) => {
      settle({
        ok: false,
        stdout,
        stderr,
        error: err.message,
      });
    });

    child.on("close", (exitCode) => {
      const result: CapturedCommandResult = {
        ok: exitCode === 0,
        stdout,
        stderr,
      };
      if (exitCode !== null) {
        result.exitCode = exitCode;
      }
      if (exitCode !== 0) {
        result.error = `Command exited with code ${exitCode ?? "unknown"}`;
      }
      settle({
        ...result,
      });
    });
  });
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf-8");
  return "";
}
