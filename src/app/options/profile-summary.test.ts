import { describe, expect, it } from "vitest";
import {
  formatImproveProfileSummary,
  formatPlayProfileSummary,
  formatRecordingProfileSummary,
} from "./profile-summary.js";

describe("profile summary formatting", () => {
  it("formats record summary", () => {
    const out = formatRecordingProfileSummary({
      browser: "chromium",
      selectorPolicy: "reliable",
      device: "iPhone 13",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
    });

    expect(out).toContain("browser=chromium");
    expect(out).toContain("selectorPolicy=reliable");
    expect(out).toContain("loadStorage=.auth/in.json");
  });

  it("formats improve summary", () => {
    const out = formatImproveProfileSummary({
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionSource: "snapshot-native",
      assertionPolicy: "balanced",
    });

    expect(out).toContain("applySelectors=no");
    expect(out).toContain("applyAssertions=yes");
    expect(out).toContain("assertionSource=snapshot-native");
    expect(out).toContain("assertionPolicy=balanced");
  });

  it("formats play summary", () => {
    const out = formatPlayProfileSummary({
      headed: false,
      timeout: 10000,
      delayMs: 0,
      waitForNetworkIdle: true,
      autoStart: true,
      saveFailureArtifacts: true,
      artifactsDir: ".ui-test-artifacts",
    });

    expect(out).toContain("timeout=10000ms");
    expect(out).toContain("autoStart=yes");
    expect(out).toContain("saveFailureArtifacts=yes");
    expect(out).toContain("artifactsDir=.ui-test-artifacts");
  });
});
