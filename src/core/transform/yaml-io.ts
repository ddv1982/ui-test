import yaml from "js-yaml";
import { parseExpressionAt } from "acorn";
import type { CallExpression, Identifier, MemberExpression } from "estree";
import { classifySelector } from "../selector-classifier.js";
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

  const normalized = normalizeInlineFrameAwareLocator(record["value"]);
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

function normalizeInlineFrameAwareLocator(
  selector: string
): { value: string; framePath: string[] } | undefined {
  const parsed = parseLocatorExpression(selector);
  if (!parsed) return undefined;

  const chain = flattenCallChain(parsed);
  if (!chain || chain.length === 0) return undefined;

  const framePath: string[] = [];
  let terminalStartIndex = 0;

  while (terminalStartIndex < chain.length) {
    const segment = chain[terminalStartIndex];
    if (!segment) break;

    if (segment.method === "frameLocator") {
      const frameSelector = firstStringArgument(segment.call.arguments);
      if (!frameSelector) return undefined;
      framePath.push(frameSelector);
      terminalStartIndex += 1;
      continue;
    }

    if (
      segment.method === "locator" &&
      terminalStartIndex + 1 < chain.length &&
      chain[terminalStartIndex + 1]?.method === "contentFrame"
    ) {
      const frameSelector = firstStringArgument(segment.call.arguments);
      if (!frameSelector) return undefined;
      framePath.push(frameSelector);
      terminalStartIndex += 2;
      continue;
    }

    break;
  }

  if (framePath.length === 0 || terminalStartIndex >= chain.length) return undefined;

  const terminal = chain[terminalStartIndex];
  if (!terminal || typeof terminal.propertyStart !== "number") return undefined;
  const parsedEnd = (parsed as CallExpression & { end?: number }).end;
  if (typeof parsedEnd !== "number") return undefined;

  const value = selector.slice(terminal.propertyStart, parsedEnd).trim();
  if (!value) return undefined;

  return { value, framePath };
}

function parseLocatorExpression(selector: string): CallExpression | undefined {
  try {
    const parsed = parseExpressionAt(selector, 0, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    return isCallExpression(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function flattenCallChain(expression: CallExpression):
  | Array<{ method: string; propertyStart?: number; call: CallExpression }>
  | undefined {
  if (isIdentifierNode(expression.callee)) {
    return [
      {
        method: expression.callee.name,
        ...(typeof expression.callee.start === "number"
          ? { propertyStart: expression.callee.start }
          : {}),
        call: expression,
      },
    ];
  }

  if (
    !isMemberExpression(expression.callee) ||
    expression.callee.computed ||
    !isIdentifierNode(expression.callee.property)
  ) {
    return undefined;
  }

  const current = {
    method: expression.callee.property.name,
    ...(typeof expression.callee.property.start === "number"
      ? { propertyStart: expression.callee.property.start }
      : {}),
    call: expression,
  };

  if (isCallExpression(expression.callee.object)) {
    const previous = flattenCallChain(expression.callee.object);
    return previous ? [...previous, current] : undefined;
  }

  if (isIdentifierNode(expression.callee.object)) {
    return [current];
  }

  return undefined;
}

function firstStringArgument(args: CallExpression["arguments"]): string | undefined {
  const first = args[0];
  if (!first || first.type !== "Literal" || typeof first.value !== "string") return undefined;
  return first.value;
}

function isCallExpression(node: unknown): node is CallExpression {
  return !!node && typeof node === "object" && (node as { type?: unknown }).type === "CallExpression";
}

function isMemberExpression(node: unknown): node is MemberExpression {
  return !!node && typeof node === "object" && (node as { type?: unknown }).type === "MemberExpression";
}

function isIdentifierNode(node: unknown): node is Identifier & { start?: number } {
  return !!node && typeof node === "object" && (node as { type?: unknown }).type === "Identifier";
}
