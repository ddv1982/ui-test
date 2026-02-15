import type { UITestConfig } from "../../utils/config.js";
import { UserError } from "../../utils/errors.js";
import {
  PLAY_DEFAULT_ARTIFACTS_DIR,
  PLAY_DEFAULT_BASE_URL,
  PLAY_DEFAULT_DELAY_MS,
  PLAY_DEFAULT_HEADED,
  PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
  PLAY_DEFAULT_START_COMMAND,
  PLAY_DEFAULT_TEST_DIR,
  PLAY_DEFAULT_TIMEOUT_MS,
  PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "../../core/play/play-defaults.js";

export interface PlayProfileInput {
  headed?: boolean;
  timeout?: string;
  delay?: string;
  waitNetworkIdle?: boolean;
  start?: boolean;
  saveFailureArtifacts?: boolean;
  artifactsDir?: string;
}

export interface ResolvedPlayProfile {
  headed: boolean;
  timeout: number;
  delayMs: number;
  waitForNetworkIdle: boolean;
  shouldAutoStart: boolean;
  saveFailureArtifacts: boolean;
  artifactsDir: string;
  baseUrl: string;
  startCommand: string;
  testDir: string;
}

export function resolvePlayProfile(
  input: PlayProfileInput,
  config: UITestConfig
): ResolvedPlayProfile {
  const headed = input.headed ?? PLAY_DEFAULT_HEADED;
  const shouldAutoStart = input.start !== false;
  const saveFailureArtifacts = input.saveFailureArtifacts ?? PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS;

  const cliTimeout =
    input.timeout !== undefined
      ? parsePositiveInt(
          input.timeout,
          "timeout",
          "CLI flag --timeout",
          "Use a positive integer in milliseconds, for example: --timeout 10000"
        )
      : undefined;
  const timeout = cliTimeout ?? PLAY_DEFAULT_TIMEOUT_MS;

  const cliDelay =
    input.delay !== undefined
      ? parseNonNegativeInt(input.delay, "CLI flag --delay")
      : undefined;
  const delayMs = cliDelay ?? PLAY_DEFAULT_DELAY_MS;

  const waitForNetworkIdle = input.waitNetworkIdle ?? PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE;
  const artifactsDir = (input.artifactsDir ?? PLAY_DEFAULT_ARTIFACTS_DIR).trim();

  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
    throw new UserError(
      `Invalid timeout value: ${timeout}`,
      "Timeout must be a positive integer in milliseconds."
    );
  }

  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new UserError(
      `Invalid delay value: ${delayMs}`,
      "Delay must be a non-negative integer in milliseconds."
    );
  }

  if (!artifactsDir) {
    throw new UserError(
      "Invalid artifacts directory value: empty path",
      "Set a non-empty path with --artifacts-dir <path>."
    );
  }

  const startCommand = config.startCommand?.trim() || PLAY_DEFAULT_START_COMMAND;

  return {
    headed,
    timeout,
    delayMs,
    waitForNetworkIdle,
    shouldAutoStart,
    saveFailureArtifacts,
    artifactsDir,
    baseUrl: config.baseUrl ?? PLAY_DEFAULT_BASE_URL,
    startCommand,
    testDir: config.testDir ?? PLAY_DEFAULT_TEST_DIR,
  };
}

function parsePositiveInt(
  input: string,
  label: string,
  source: string,
  hint: string
): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid ${label} value from ${source}: ${input}`,
      hint
    );
  }
  return value;
}

function parseNonNegativeInt(input: string, source: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid delay value from ${source}: ${input}`,
      "Use a non-negative integer in milliseconds, for example: --delay 2000"
    );
  }
  return value;
}
