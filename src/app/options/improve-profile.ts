import type {
  ImproveAssertionsMode,
  ImproveAssertionSource,
} from "../../core/improve/improve.js";
import type { UITestConfig } from "../../utils/config.js";
import { UserError } from "../../utils/errors.js";

export interface ImproveProfileInput {
  apply?: boolean;
  applyAssertions?: boolean;
  assertions?: string;
  assertionSource?: string;
  report?: string;
}

export interface ResolvedImproveProfile {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  apply: boolean;
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
      "deterministic",
    apply: input.apply ?? (config.improveApplyMode ? config.improveApplyMode === "apply" : false),
    applyAssertions: input.applyAssertions ?? config.improveApplyAssertions ?? false,
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
  if (normalized === "deterministic" || normalized === "snapshot-cli") {
    return normalized;
  }
  throw new UserError(
    `Invalid assertion source: ${value}`,
    "Use --assertion-source deterministic or --assertion-source snapshot-cli"
  );
}
