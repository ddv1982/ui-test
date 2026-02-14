import type { RecordBrowser } from "../../core/recorder.js";
import type { SelectorPolicy } from "./record-profile.js";

export function formatRecordingProfileSummary(profile: {
  browser: RecordBrowser;
  selectorPolicy: SelectorPolicy;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}): string {
  return `Recording profile: browser=${profile.browser}, selectorPolicy=${profile.selectorPolicy}, device=${profile.device ?? "(none)"}, testIdAttr=${profile.testIdAttribute ?? "(default)"}, loadStorage=${profile.loadStorage ?? "(none)"}, saveStorage=${profile.saveStorage ?? "(none)"}`;
}

export function formatImproveProfileSummary(profile: {
  apply: boolean;
  applyAssertions: boolean;
  assertions: string;
  assertionSource: string;
}): string {
  return `Improve profile: apply=${profile.apply ? "yes" : "no"}, applyAssertions=${profile.applyAssertions ? "yes" : "no"}, assertions=${profile.assertions}, assertionSource=${profile.assertionSource}`;
}

export function formatPlayProfileSummary(profile: {
  headed: boolean;
  timeout: number;
  delayMs: number;
  waitForNetworkIdle: boolean;
  networkIdleTimeout: number;
  autoStart: boolean;
  saveFailureArtifacts: boolean;
  artifactsDir: string;
}): string {
  return `Play profile: headed=${profile.headed ? "yes" : "no"}, timeout=${profile.timeout}ms, delay=${profile.delayMs}ms, waitNetworkIdle=${profile.waitForNetworkIdle ? "yes" : "no"}, networkIdleTimeout=${profile.networkIdleTimeout}ms, autoStart=${profile.autoStart ? "yes" : "no"}, saveFailureArtifacts=${profile.saveFailureArtifacts ? "yes" : "no"}, artifactsDir=${profile.artifactsDir}`;
}
