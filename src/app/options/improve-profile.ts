import type {
  ImproveAssertionsMode,
  ImproveAssertionApplyPolicy,
  ImproveAssertionSource,
} from "../../core/improve/improve.js";
import type { UITestConfig } from "../../utils/config.js";
import { UserError } from "../../utils/errors.js";

export interface ImproveProfileInput {
  apply?: boolean;
  applySelectors?: boolean;
  applyAssertions?: boolean;
  assertions?: string;
  assertionSource?: string;
  assertionApplyPolicy?: string;
  report?: string;
}

export interface ResolvedImproveProfile {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  assertionApplyPolicy: ImproveAssertionApplyPolicy;
  applySelectors: boolean;
  applyAssertions: boolean;
  reportPath?: string;
}

export function resolveImproveProfile(
  input: ImproveProfileInput,
  config: UITestConfig
): ResolvedImproveProfile {
  return {
    assertions: parseImproveAssertions(input.assertions) ?? config.improveAssertions ?? "candidates",
    assertionSource:
      parseImproveAssertionSource(input.assertionSource) ??
      config.improveAssertionSource ??
      "snapshot-native",
    assertionApplyPolicy:
      parseImproveAssertionApplyPolicy(input.assertionApplyPolicy) ??
      config.improveAssertionApplyPolicy ??
      "reliable",
    // Precedence: granular flags (--apply-selectors, --apply-assertions) > umbrella --apply > config
    applySelectors: input.applySelectors ?? input.apply
      ?? (config.improveApplyMode === "apply" ? true : false),
    applyAssertions: input.applyAssertions ?? input.apply
      ?? config.improveApplyAssertions ?? false,
    reportPath: input.report,
  };
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
  if (normalized === "deterministic" || normalized === "snapshot-cli" || normalized === "snapshot-native") {
    return normalized;
  }
  throw new UserError(
    `Invalid assertion source: ${value}`,
    "Use --assertion-source deterministic, --assertion-source snapshot-cli, or --assertion-source snapshot-native"
  );
}

export function parseImproveAssertionApplyPolicy(
  value: string | undefined
): ImproveAssertionApplyPolicy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "reliable" || normalized === "aggressive") {
    return normalized;
  }
  throw new UserError(
    `Invalid assertion apply policy: ${value}`,
    "Use --assertion-apply-policy reliable or --assertion-apply-policy aggressive"
  );
}
