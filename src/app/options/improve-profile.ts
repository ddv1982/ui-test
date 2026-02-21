import type {
  ImproveAssertionsMode,
  ImproveAssertionSource,
  ImproveAssertionPolicy,
} from "../../core/improve/improve.js";
import { DEFAULT_IMPROVE_ASSERTION_POLICY } from "../../core/improve/assertion-policy.js";
import { UserError } from "../../utils/errors.js";

export interface ImproveProfileInput {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  assertionPolicy?: string;
  report?: string;
}

export interface ResolvedImproveProfile {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  assertionPolicy: ImproveAssertionPolicy;
  applySelectors: boolean;
  applyAssertions: boolean;
  reportPath?: string;
}

export function resolveImproveProfile(
  input: ImproveProfileInput
): ResolvedImproveProfile {
  const apply = input.apply ?? false;
  const profile: ResolvedImproveProfile = {
    assertions: parseImproveAssertions(input.assertions) ?? "candidates",
    assertionSource:
      parseImproveAssertionSource(input.assertionSource) ??
      "snapshot-native",
    assertionPolicy:
      parseImproveAssertionPolicy(input.assertionPolicy) ??
      DEFAULT_IMPROVE_ASSERTION_POLICY,
    applySelectors: apply,
    applyAssertions: apply,
  };

  if (input.report !== undefined) {
    profile.reportPath = input.report;
  }

  return profile;
}

export function parseImproveAssertions(value: string | undefined): ImproveAssertionsMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "candidates") {
    return normalized;
  }
  throw new UserError(
    `Invalid assertions mode: ${value}`,
    "Use --assertions none or --assertions candidates"
  );
}

export function parseImproveAssertionSource(
  value: string | undefined
): ImproveAssertionSource | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "deterministic") return "deterministic";
  if (normalized === "snapshot-native") return "snapshot-native";
  throw new UserError(
    `Invalid assertion source: ${value}`,
    "Use --assertion-source deterministic or --assertion-source snapshot-native"
  );
}

export function parseImproveAssertionPolicy(
  value: string | undefined
): ImproveAssertionPolicy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "reliable" ||
    normalized === "balanced" ||
    normalized === "aggressive"
  ) {
    return normalized;
  }
  throw new UserError(
    `Invalid assertion policy: ${value}`,
    "Use --assertion-policy reliable, --assertion-policy balanced, or --assertion-policy aggressive"
  );
}
