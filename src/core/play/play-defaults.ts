import path from "node:path";
import { DEFAULT_WAIT_FOR_NETWORK_IDLE } from "../runtime/network-idle.js";
import type { PlaywrightBrowser } from "../contracts/browser-launcher.js";

// Single source of truth for play runtime defaults.
export const PLAY_DEFAULT_BROWSER: PlaywrightBrowser = "chromium";
export const PLAY_DEFAULT_HEADED = false;
export const PLAY_DEFAULT_TIMEOUT_MS = 10_000;
export const PLAY_DEFAULT_DELAY_MS = 0;
export const PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE = DEFAULT_WAIT_FOR_NETWORK_IDLE;
export const PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS = true;
export const PLAY_DEFAULT_ARTIFACTS_DIR = ".ui-test-artifacts";
export const PLAY_DEFAULT_TEST_DIR = "e2e";
export const PLAY_DEFAULT_EXAMPLE_TEST_FILE = `${PLAY_DEFAULT_TEST_DIR}/example.yaml`;
export const PLAY_DEFAULT_BASE_URL = "http://127.0.0.1:5173";
export const PLAY_DEFAULT_START_COMMAND = resolvePlayDefaultStartCommand();

function resolvePlayDefaultStartCommand(
  cwd = process.cwd(),
  argv1 = process.argv[1],
  nodePath = process.execPath
): string {
  const resolvedInvocationPath = resolvePlayInvocationPath(argv1, cwd);
  const args = ["example-app", "--host", "127.0.0.1", "--port", "5173"];
  if (!resolvedInvocationPath) {
    return ["ui-test", ...args].map(quoteShellArg).join(" ");
  }

  return [nodePath, resolvedInvocationPath, ...args].map(quoteShellArg).join(" ");
}

function resolvePlayInvocationPath(argv1: string | undefined, cwd: string): string | undefined {
  if (!argv1) return undefined;
  if (argv1.startsWith("file://")) return undefined;
  if (path.isAbsolute(argv1)) return path.resolve(argv1);
  if (argv1.includes(path.sep) || argv1.includes("/") || argv1.includes("\\")) {
    return path.resolve(cwd, argv1);
  }
  return undefined;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
