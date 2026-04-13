import { UserError } from "../../utils/errors.js";
import {
  validateBrowserName,
  type PlaywrightBrowser,
} from "../../infra/playwright/browser-provisioner.js";
import {
  PLAY_DEFAULT_ARTIFACTS_DIR,
  PLAY_DEFAULT_BASE_URL,
  PLAY_DEFAULT_BROWSER,
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
  loadStorage?: string;
  browser?: string;
}

export interface ResolvedPlayProfile {
  headed: boolean;
  timeout: number;
  delayMs: number;
  waitForNetworkIdle: boolean;
  shouldAutoStart: boolean;
  saveFailureArtifacts: boolean;
  artifactsDir: string;
  loadStorage?: string;
  baseUrl: string;
  startCommand: string;
  testDir: string;
  browser: PlaywrightBrowser;
}

export function resolvePlayProfile(
  input: PlayProfileInput
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
  const loadStorage = cleanOptionalPath(input.loadStorage, "load storage path", "--load-storage <path>");
  const browser = parseBrowserOption(input.browser);

  if (!artifactsDir) {
    throw new UserError(
      "Invalid artifacts directory value: empty path",
      "Set a non-empty path with --artifacts-dir <path>."
    );
  }

  return {
    headed,
    timeout,
    delayMs,
    waitForNetworkIdle,
    shouldAutoStart,
    saveFailureArtifacts,
    artifactsDir,
    ...(loadStorage !== undefined ? { loadStorage } : {}),
    baseUrl: PLAY_DEFAULT_BASE_URL,
    startCommand: PLAY_DEFAULT_START_COMMAND,
    testDir: PLAY_DEFAULT_TEST_DIR,
    browser,
  };
}

function cleanOptionalPath(
  input: string | undefined,
  label: string,
  hintFlag: string
): string | undefined {
  if (input === undefined) return undefined;
  const value = input.trim();
  if (value.length === 0) {
    throw new UserError(
      `Invalid ${label}: empty path`,
      `Set a non-empty path with ${hintFlag}.`
    );
  }
  return value;
}

function parseBrowserOption(input: string | undefined): PlaywrightBrowser {
  if (input === undefined) return PLAY_DEFAULT_BROWSER;
  return validateBrowserName(input);
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
