import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  PLAY_DEFAULT_ARTIFACTS_DIR,
  PLAY_DEFAULT_BASE_URL,
  PLAY_DEFAULT_DELAY_MS,
  PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
  PLAY_DEFAULT_START_COMMAND,
  PLAY_DEFAULT_TEST_DIR,
  PLAY_DEFAULT_TIMEOUT_MS,
  PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "../../core/play/play-defaults.js";
import { resolvePlayProfile } from "./play-profile.js";

describe("resolvePlayProfile", () => {
  it("uses CLI overrides over config", () => {
    const out = resolvePlayProfile(
      {
        headed: true,
        timeout: "1500",
        delay: "50",
        waitNetworkIdle: false,
        saveFailureArtifacts: false,
        artifactsDir: "./tmp-artifacts",
        start: false,
      },
      {
        startCommand: "npm run dev",
        baseUrl: "http://127.0.0.1:5173",
      }
    );

    expect(out.headed).toBe(true);
    expect(out.timeout).toBe(1500);
    expect(out.delayMs).toBe(50);
    expect(out.waitForNetworkIdle).toBe(false);
    expect(out.shouldAutoStart).toBe(false);
    expect(out.saveFailureArtifacts).toBe(false);
    expect(out.artifactsDir).toBe("./tmp-artifacts");
  });

  it("uses defaults when values are missing", () => {
    const out = resolvePlayProfile({}, {});
    expect(out.timeout).toBe(PLAY_DEFAULT_TIMEOUT_MS);
    expect(out.delayMs).toBe(PLAY_DEFAULT_DELAY_MS);
    expect(out.waitForNetworkIdle).toBe(PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE);
    expect(out.saveFailureArtifacts).toBe(PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS);
    expect(out.artifactsDir).toBe(PLAY_DEFAULT_ARTIFACTS_DIR);
    expect(out.testDir).toBe(PLAY_DEFAULT_TEST_DIR);
    expect(out.baseUrl).toBe(PLAY_DEFAULT_BASE_URL);
    expect(out.startCommand).toBe(PLAY_DEFAULT_START_COMMAND);
  });

  it("throws for invalid numeric CLI flags", () => {
    expect(() => resolvePlayProfile({ timeout: "abc" }, {})).toThrow(UserError);
    expect(() => resolvePlayProfile({ delay: "-1" }, {})).toThrow(UserError);
    expect(() => resolvePlayProfile({ artifactsDir: "   " }, {})).toThrow(UserError);
  });
});
