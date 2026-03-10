import { spawn, type SpawnOptions } from "node:child_process";
import type { InteractiveCommandResult } from "../../core/contracts/process-runner.js";

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
