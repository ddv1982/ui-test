import type { Step } from "../yaml-schema.js";

function quote(s: string): string {
  return "'" + s + "'";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function readQuotedString(input: string, quoteIndex: number): string | undefined {
  const quote = input[quoteIndex];
  if (quote !== "'" && quote !== '"') return undefined;

  let result = "";
  let escaped = false;
  for (let i = quoteIndex + 1; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return result;
    }
    result += ch;
  }
  return undefined;
}

function findUnquotedMarker(input: string, marker: string, fromIndex: number): number {
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = fromIndex; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (input.startsWith(marker, i)) {
      return i;
    }
  }

  return -1;
}

function readQuotedValueAfter(input: string, marker: string): string | undefined {
  let fromIndex = 0;
  while (fromIndex < input.length) {
    const markerIndex = findUnquotedMarker(input, marker, fromIndex);
    if (markerIndex === -1) return undefined;

    let i = markerIndex + marker.length;
    while (i < input.length && /\s/.test(input[i])) i += 1;

    const value = readQuotedString(input, i);
    if (value !== undefined) return value;

    fromIndex = markerIndex + marker.length;
  }
  return undefined;
}

function targetLabel(step: Step): string {
  if (step.action === "navigate") return "";
  if (step.action === "press") return step.key;
  const val = step.target.value;
  if (step.target.kind === "locatorExpression") {
    const nameArg = readQuotedValueAfter(val, "name:");
    if (nameArg) return nameArg;
    const firstArg = readQuotedValueAfter(val, "(");
    if (firstArg) return firstArg;
  }
  return truncate(val, 30);
}

const SENSITIVE_PATTERN = /password|passwd|pwd|secret|token|credential|api.?key/i;

function isSensitiveTarget(step: Step): boolean {
  if (step.action === "navigate") return false;
  return SENSITIVE_PATTERN.test(step.target.value);
}

function stepDetail(step: Step): string {
  const masked = isSensitiveTarget(step);
  if (step.action === "fill") {
    const val = masked ? "\u2022\u2022\u2022\u2022" : truncate(step.text, 20);
    return ' \u2192 "' + val + '"';
  }
  if (step.action === "assertText") {
    return ' \u2192 "' + truncate(step.text, 20) + '"';
  }
  if (step.action === "assertValue" || step.action === "select") {
    const val = masked ? "\u2022\u2022\u2022\u2022" : truncate(step.value, 20);
    return ' \u2192 "' + val + '"';
  }
  return "";
}

export function stepDescription(step: Step, index: number): string {
  const desc = step.description ? " - " + step.description : "";
  if (step.action === "navigate") {
    return "Step " + (index + 1) + ": navigate to " + step.url + desc;
  }
  const label = targetLabel(step);
  const target = label ? " " + quote(label) : "";
  const detail = stepDetail(step);
  return "Step " + (index + 1) + ": " + step.action + target + detail + desc;
}
