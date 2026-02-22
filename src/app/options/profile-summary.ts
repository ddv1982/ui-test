import type { RecordBrowser } from "../../core/recorder.js";

export function formatRecordingProfileSummary(profile: {
  browser: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}): string {
  return `Recording profile: browser=${profile.browser}, device=${profile.device ?? "(none)"}, testIdAttr=${profile.testIdAttribute ?? "(default)"}, loadStorage=${profile.loadStorage ?? "(none)"}, saveStorage=${profile.saveStorage ?? "(none)"}`;
}

export function formatImproveProfileSummary(profile: {
  applySelectors: boolean;
  applyAssertions: boolean;
  assertions: string;
  assertionSource: string;
  assertionPolicy: string;
}): string {
  return `Improve profile: applySelectors=${profile.applySelectors ? "yes" : "no"}, applyAssertions=${profile.applyAssertions ? "yes" : "no"}, assertions=${profile.assertions}, assertionSource=${profile.assertionSource}, assertionPolicy=${profile.assertionPolicy}`;
}

export function formatPlayProfileSummary(profile: {
  headed: boolean;
  timeout: number;
  delayMs: number;
  waitForNetworkIdle: boolean;
  autoStart: boolean;
  saveFailureArtifacts: boolean;
  artifactsDir: string;
  browser: string;
}): string {
  return `Play profile: browser=${profile.browser}, headed=${profile.headed ? "yes" : "no"}, timeout=${profile.timeout}ms, delay=${profile.delayMs}ms, waitNetworkIdle=${profile.waitForNetworkIdle ? "yes" : "no"}, autoStart=${profile.autoStart ? "yes" : "no"}, saveFailureArtifacts=${profile.saveFailureArtifacts ? "yes" : "no"}, artifactsDir=${profile.artifactsDir}`;
}
