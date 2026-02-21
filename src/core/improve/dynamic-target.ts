import type { Target } from "../yaml-schema.js";
import { detectDynamicSignals } from "./dynamic-signal-detection.js";

export type DynamicSignal =
  | "exact_true"
  | "long_text"
  | "contains_numeric_fragment"
  | "contains_date_or_time_fragment"
  | "contains_weather_or_news_fragment"
  | "contains_headline_like_text"
  | "contains_pipe_separator"
  | "unsupported_expression_shape"
  | "navigate_context";

export interface TargetDynamicAssessment {
  isDynamic: boolean;
  dynamicSignals: DynamicSignal[];
}

export function assessTargetDynamics(target: Target): TargetDynamicAssessment {
  const dynamicSignals = detectTargetDynamicSignals(target);
  return {
    isDynamic: dynamicSignals.length > 0,
    dynamicSignals,
  };
}

export function detectTargetDynamicSignals(target: Target): DynamicSignal[] {
  const out: DynamicSignal[] = [];

  if (hasExactTrueOption(target.value)) {
    out.push("exact_true");
  }

  const textFragments = extractTargetTextFragments(target);
  for (const fragment of textFragments) {
    const normalized = fragment.trim();
    if (!normalized) continue;
    if (normalized.length >= 48) {
      out.push("long_text");
    }
    out.push(...normalizeDynamicSignals(detectDynamicSignals(normalized)));
  }

  return uniqueSignals(out);
}

export function extractTargetTextFragments(target: Target): string[] {
  switch (target.kind) {
    case "locatorExpression":
      return extractLocatorExpressionTextFragments(target.value);
    case "playwrightSelector":
    case "internal":
      return extractRuntimeSelectorTextFragments(target.value);
    default:
      return [];
  }
}

export function extractLocatorExpressionTextFragments(value: string): string[] {
  const fragments: string[] = [];

  for (const match of value.matchAll(/name:\s*['"]([^'"]+)['"]/gu)) {
    if (match[1]) fragments.push(match[1]);
  }
  for (const match of value.matchAll(/getBy(?:Text|Label|Placeholder|Title)\(\s*['"]([^'"]+)['"]/gu)) {
    if (match[1]) fragments.push(match[1]);
  }
  for (const match of value.matchAll(/text\s*=\s*['"]([^'"]+)['"]/gu)) {
    if (match[1]) fragments.push(match[1]);
  }

  return uniqueStrings(fragments);
}

export function extractRuntimeSelectorTextFragments(value: string): string[] {
  const fragments: string[] = [];

  const engineIndex = value.indexOf("=");
  if (engineIndex > 0) {
    const engine = value.slice(0, engineIndex).trim().toLowerCase();
    const rawBody = value.slice(engineIndex + 1).trim();
    if (engine === "text") {
      const textBody = unquoteString(rawBody) ?? readUnquotedSelectorBody(rawBody);
      if (textBody) fragments.push(textBody);
    }
    if (engine === "internal:role") {
      const nameAttr = readRuntimeNameAttribute(rawBody);
      if (nameAttr) fragments.push(nameAttr);
    }
  }

  for (const match of value.matchAll(/name=(?:"([^"]+)"|'([^']+)')/gu)) {
    if (match[1]) fragments.push(match[1]);
    else if (match[2]) fragments.push(match[2]);
  }

  for (const match of value.matchAll(/text\s*=\s*['"]([^'"]+)['"]/gu)) {
    if (match[1]) fragments.push(match[1]);
  }
  for (const match of value.matchAll(/text\s*=\s*([^'"\]\n][^\n]*?)(?=\s*>>|\s*\]|$)/gu)) {
    const raw = match[1]?.trim();
    if (raw) fragments.push(raw);
  }

  for (const match of value.matchAll(/['"]([^'"]{4,})['"]/gu)) {
    if (match[1]) fragments.push(match[1]);
  }

  return uniqueStrings(fragments);
}

export function normalizeDynamicSignals(signals: string[]): DynamicSignal[] {
  const normalized: DynamicSignal[] = [];
  for (const signal of signals) {
    if (!signal) continue;
    normalized.push(signal as DynamicSignal);
  }
  return uniqueSignals(normalized);
}

function readRuntimeNameAttribute(value: string): string | undefined {
  const match = /name=(?:"([^"]+)"|'([^']+)'|([^\s\]]+))/u.exec(value);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return undefined;
  return raw.trim() || undefined;
}

function readUnquotedSelectorBody(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const segment = trimmed.split(/\s*>>\s*/u)[0]?.trim() ?? "";
  if (!segment) return undefined;
  return segment;
}

function unquoteString(value: string): string | undefined {
  if (value.length < 2) return undefined;
  const startsWithSingle = value.startsWith("'");
  const startsWithDouble = value.startsWith('"');
  if (!startsWithSingle && !startsWithDouble) return undefined;
  const quote = startsWithSingle ? "'" : '"';
  if (!value.endsWith(quote)) return undefined;
  const inner = value.slice(1, -1);
  if (!inner) return undefined;
  return inner
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function hasExactTrueOption(selector: string): boolean {
  return /\bexact\s*:\s*true\b/i.test(selector) || /\bexact\s*=\s*true\b/i.test(selector);
}

function uniqueSignals(signals: DynamicSignal[]): DynamicSignal[] {
  return [...new Set(signals)];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
