import { DEFAULT_WAIT_FOR_NETWORK_IDLE } from "../runtime/network-idle.js";

// Single source of truth for play runtime defaults.
export const PLAY_DEFAULT_HEADED = false;
export const PLAY_DEFAULT_TIMEOUT_MS = 10_000;
export const PLAY_DEFAULT_DELAY_MS = 0;
export const PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE = DEFAULT_WAIT_FOR_NETWORK_IDLE;
export const PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS = true;
export const PLAY_DEFAULT_ARTIFACTS_DIR = ".ui-test-artifacts";
export const PLAY_DEFAULT_TEST_DIR = "e2e";
export const PLAY_DEFAULT_BASE_URL = "http://127.0.0.1:5173";
export const PLAY_DEFAULT_START_COMMAND =
  "ui-test example-app --host 127.0.0.1 --port 5173 || npx -y github:ddv1982/easy-e2e-testing example-app --host 127.0.0.1 --port 5173";
