import yaml from "js-yaml";
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
  return normalizeLegacyTargetSources(yaml.load(yamlContent));
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
