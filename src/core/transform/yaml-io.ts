import yaml from "js-yaml";
import { classifySelector } from "../selector-classifier.js";
import { normalizeFrameAwareLocatorSelector } from "./frame-aware-locator.js";
import { scoreLocatorConfidence } from "./locator-confidence.js";
import type { Step, TestFile } from "../yaml-schema.js";

export function stepsToYaml(
  name: string,
  steps: Step[],
  options?: { description?: string; baseUrl?: string }
): string {
  const test: TestFile = {
    name,
    ...(options?.description && { description: options.description }),
    ...(options?.baseUrl && { baseUrl: options.baseUrl }),
    steps,
  };

  return yaml.dump(test, { lineWidth: 120, noRefs: true, quotingType: '"' });
}

export function yamlToTest(yamlContent: string): unknown {
  return normalizeFrameAwareYamlTargets(normalizeLegacyTargetSources(yaml.load(yamlContent)));
}

function normalizeLegacyTargetSources(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLegacyTargetSources(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (
      key === "source" &&
      (entry === "codegen-jsonl" || entry === "codegen-fallback")
    ) {
      normalized[key] = "codegen";
      continue;
    }
    normalized[key] = normalizeLegacyTargetSources(entry);
  }

  return normalized;
}

function normalizeFrameAwareYamlTargets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFrameAwareYamlTargets(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = normalizeFrameAwareYamlTargets(entry);
  }

  return normalizeTargetRecord(normalized);
}

function normalizeTargetRecord(record: Record<string, unknown>): Record<string, unknown> {
  if (
    record["kind"] !== "locatorExpression" ||
    typeof record["value"] !== "string" ||
    Array.isArray(record["framePath"])
  ) {
    return record;
  }

  const normalized = normalizeFrameAwareLocatorSelector(record["value"]);
  if (!normalized) return record;

  return {
    ...record,
    value: normalized.value,
    framePath: normalized.framePath,
    raw: typeof record["raw"] === "string" ? record["raw"] : record["value"],
    ...(typeof record["confidence"] === "number"
      ? {}
      : { confidence: scoreLocatorConfidence(normalized.value) }),
    kind: classifySelector(normalized.value).kind,
  };
}
