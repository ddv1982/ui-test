import type { OllamaConfig } from "../../core/improve/llm/ollama-client.js";
import type {
  ImproveAssertionsMode,
  ImproveProvider,
} from "../../core/improve/improve.js";
import type { UITestConfig } from "../../utils/config.js";
import { UserError } from "../../utils/errors.js";

export interface ImproveProfileInput {
  apply?: boolean;
  applyAssertions?: boolean;
  llm?: boolean;
  provider?: string;
  assertions?: string;
  report?: string;
}

export interface ResolvedImproveProfile {
  provider: ImproveProvider;
  assertions: ImproveAssertionsMode;
  apply: boolean;
  applyAssertions: boolean;
  llmEnabled: boolean;
  reportPath?: string;
  llmConfig: OllamaConfig;
}

export function resolveImproveProfile(
  input: ImproveProfileInput,
  config: UITestConfig
): ResolvedImproveProfile {
  return {
    provider: parseImproveProvider(input.provider) ?? config.improveProvider ?? "auto",
    assertions: parseImproveAssertions(input.assertions) ?? config.improveAssertions ?? "candidates",
    apply: input.apply ?? (config.improveApplyMode ? config.improveApplyMode === "apply" : false),
    applyAssertions: input.applyAssertions ?? config.improveApplyAssertions ?? false,
    llmEnabled: input.llm ?? config.llm?.enabled ?? false,
    reportPath: input.report,
    llmConfig: {
      baseUrl: config.llm?.baseUrl ?? "http://127.0.0.1:11434",
      model: config.llm?.model ?? "gemma3:4b",
      timeoutMs: config.llm?.timeoutMs ?? 12_000,
      temperature: config.llm?.temperature ?? 0,
      maxOutputTokens: config.llm?.maxOutputTokens ?? 600,
    },
  };
}

export function parseImproveProvider(value: string | undefined): ImproveProvider | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "playwright" || normalized === "playwright-cli") {
    return normalized;
  }
  throw new UserError(
    `Invalid provider: ${value}`,
    "Use --provider auto, --provider playwright, or --provider playwright-cli"
  );
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
