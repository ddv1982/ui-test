import type { SpawnOptions } from "node:child_process";

export interface InteractiveCommandResult {
  exitCode?: number;
  signal?: NodeJS.Signals | null;
}

export type RunInteractiveCommand = (
  command: string,
  args: string[],
  options?: SpawnOptions
) => Promise<InteractiveCommandResult>;
