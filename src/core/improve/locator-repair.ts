import { parseExpressionAt, type Node as AcornNode } from "acorn";
import type { Expression } from "estree";
import type { Target } from "../yaml-schema.js";
import type { ImproveDiagnostic } from "./report-schema.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { quote } from "./candidate-generator.js";

type SupportedRootMethod =
  | "getByRole"
  | "getByText"
  | "getByLabel"
  | "getByPlaceholder"
  | "getByTitle";

interface ParsedLocatorExpression {
  method: SupportedRootMethod;
  role?: string;
  queryText: string;
  exact: boolean;
  suffix: "" | ".first()" | ".last()" | `.nth(${number})`;
}

const WEATHER_OR_VOLATILE_KEYWORDS = new Set([
  "weather",
  "winterweer",
  "winter",
  "storm",
  "sneeuw",
  "rain",
  "regen",
  "temperatuur",
  "temperature",
  "breaking",
  "liveblog",
  "update",
]);

const STABLE_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "voor",
  "van",
  "het",
  "een",
  "de",
  "in",
  "op",
  "naar",
  "about",
  "this",
  "that",
  "from",
]);

export interface LocatorRepairAnalysis {
  candidates: TargetCandidate[];
  diagnostics: ImproveDiagnostic[];
}

export function analyzeAndBuildLocatorRepairCandidates(input: {
  target: Target;
  stepNumber: number;
}): LocatorRepairAnalysis {
  if (input.target.kind !== "locatorExpression") {
    return { candidates: [], diagnostics: [] };
  }

  const expression = input.target.value.trim();
  const parse = parseSupportedLocatorExpression(expression);
  if (!parse) {
    if (looksPotentiallyBrittleExpression(expression)) {
      return {
        candidates: [],
        diagnostics: [
          {
            code: "selector_target_flagged_volatile",
            level: "info",
            message:
              `Step ${input.stepNumber}: selector looked brittle but could not be rewritten because expression shape is unsupported.`,
          },
        ],
      };
    }
    return { candidates: [], diagnostics: [] };
  }

  const volatilityFlags = getVolatilityFlags(parse.queryText);
  const brittleFlags: string[] = [];
  if (parse.exact) brittleFlags.push("exact_true");
  if (parse.queryText.length >= 48) brittleFlags.push("long_text");
  brittleFlags.push(...volatilityFlags);

  if (brittleFlags.length === 0) {
    return { candidates: [], diagnostics: [] };
  }

  const candidates: TargetCandidate[] = [];
  const seen = new Set<string>();
  const diagnostics: ImproveDiagnostic[] = [
    {
      code: "selector_target_flagged_volatile",
      level: "info",
      message:
        `Step ${input.stepNumber}: selector flagged as brittle (${brittleFlags.join(", ")}). Trying repair variants.`,
    },
  ];

  const pushCandidate = (value: string, reasonCode: string) => {
    const target: Target = {
      value,
      kind: "locatorExpression",
      source: "manual",
      ...(input.target.framePath ? { framePath: input.target.framePath } : {}),
    };
    const key = JSON.stringify({
      value: target.value,
      kind: target.kind,
      source: target.source,
      framePath: target.framePath ?? [],
    });
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `repair-${candidates.length + 1}`,
      target,
      source: "derived",
      reasonCodes: [reasonCode],
    });
  };

  if (parse.exact) {
    pushCandidate(buildExpression(parse, "string"), "locator_repair_remove_exact");
  }

  const regexPattern = buildStableRegexPattern(parse.queryText);
  if (regexPattern) {
    pushCandidate(buildExpression(parse, "regex", regexPattern), "locator_repair_regex");
    pushCandidate(
      buildExpression(parse, "regex-filter", regexPattern),
      "locator_repair_filter_has_text"
    );
  }

  return { candidates, diagnostics };
}

function looksPotentiallyBrittleExpression(expression: string): boolean {
  if (/exact\s*:\s*true/.test(expression)) return true;
  const quoted = extractFirstQuotedString(expression);
  if (!quoted) return false;
  if (quoted.length >= 48) return true;
  return getVolatilityFlags(quoted).length > 0;
}

function extractFirstQuotedString(value: string): string | undefined {
  const match = /['"]([^'"]{4,})['"]/.exec(value);
  return match?.[1];
}

function parseSupportedLocatorExpression(
  expression: string
): ParsedLocatorExpression | undefined {
  const parsed = safeParseExpression(expression);
  if (!parsed) return undefined;
  if (!isExpressionNode(parsed)) return undefined;

  let current = parsed as Expression;
  let suffix: ParsedLocatorExpression["suffix"] = "";

  if (isCallWithMember(current, "first")) {
    if (current.arguments.length !== 0) return undefined;
    suffix = ".first()";
    current = current.callee.object;
  } else if (isCallWithMember(current, "last")) {
    if (current.arguments.length !== 0) return undefined;
    suffix = ".last()";
    current = current.callee.object;
  } else if (isCallWithMember(current, "nth")) {
    const nthArg = current.arguments[0];
    if (!nthArg || nthArg.type !== "Literal" || typeof nthArg.value !== "number") {
      return undefined;
    }
    suffix = `.nth(${nthArg.value})`;
    current = current.callee.object;
  }

  if (current.type !== "CallExpression" || current.callee.type !== "Identifier") {
    return undefined;
  }

  const method = current.callee.name;
  if (!isSupportedRootMethod(method)) return undefined;

  if (method === "getByRole") {
    const roleArg = current.arguments[0];
    const optionsArg = current.arguments[1];
    if (
      !roleArg ||
      roleArg.type !== "Literal" ||
      typeof roleArg.value !== "string" ||
      !optionsArg ||
      optionsArg.type !== "ObjectExpression"
    ) {
      return undefined;
    }

    let nameValue: string | undefined;
    let exact = false;
    for (const prop of optionsArg.properties) {
      if (prop.type !== "Property" || prop.computed || prop.key.type !== "Identifier") {
        return undefined;
      }
      if (prop.key.name === "name") {
        if (prop.value.type !== "Literal" || typeof prop.value.value !== "string") {
          return undefined;
        }
        nameValue = prop.value.value;
        continue;
      }
      if (prop.key.name === "exact") {
        if (prop.value.type !== "Literal" || typeof prop.value.value !== "boolean") {
          return undefined;
        }
        exact = prop.value.value;
        continue;
      }
      return undefined;
    }

    if (!nameValue) return undefined;

    return {
      method,
      role: roleArg.value,
      queryText: nameValue,
      exact,
      suffix,
    };
  }

  const textArg = current.arguments[0];
  const optionsArg = current.arguments[1];
  if (!textArg || textArg.type !== "Literal" || typeof textArg.value !== "string") {
    return undefined;
  }
  if (!optionsArg) {
    return {
      method,
      queryText: textArg.value,
      exact: false,
      suffix,
    };
  }
  if (optionsArg.type !== "ObjectExpression") return undefined;

  let exact = false;
  for (const prop of optionsArg.properties) {
    if (prop.type !== "Property" || prop.computed || prop.key.type !== "Identifier") {
      return undefined;
    }
    if (prop.key.name !== "exact") return undefined;
    if (prop.value.type !== "Literal" || typeof prop.value.value !== "boolean") {
      return undefined;
    }
    exact = prop.value.value;
  }

  return {
    method,
    queryText: textArg.value,
    exact,
    suffix,
  };
}

function safeParseExpression(expression: string): AcornNode | undefined {
  try {
    const parsed = parseExpressionAt(expression, 0, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    if (expression.slice(parsed.end).trim().length > 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function isExpressionNode(node: AcornNode): node is AcornNode & Expression {
  return typeof (node as { type?: unknown }).type === "string";
}

function isCallWithMember(
  expression: Expression,
  member: "first" | "last" | "nth"
): expression is Expression & {
  type: "CallExpression";
  callee: { type: "MemberExpression"; object: Expression; property: { type: "Identifier"; name: string } };
} {
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "MemberExpression" &&
    expression.callee.property.type === "Identifier" &&
    expression.callee.property.name === member &&
    expression.callee.object.type === "CallExpression"
  );
}

function isSupportedRootMethod(value: string): value is SupportedRootMethod {
  return (
    value === "getByRole" ||
    value === "getByText" ||
    value === "getByLabel" ||
    value === "getByPlaceholder" ||
    value === "getByTitle"
  );
}

function buildExpression(
  parsed: ParsedLocatorExpression,
  mode: "string" | "regex" | "regex-filter",
  regexPattern?: string
): string {
  const suffix = parsed.suffix;
  if (parsed.method === "getByRole") {
    const role = quote(parsed.role ?? "button");
    if (mode === "string") {
      return `getByRole(${role}, { name: ${quote(parsed.queryText)} })${suffix}`;
    }
    const regex = `/${regexPattern ?? escapeRegex(parsed.queryText)}/i`;
    const root = `getByRole(${role}, { name: ${regex} })`;
    if (mode === "regex") return `${root}${suffix}`;
    return `${root}.filter({ hasText: ${regex} })${suffix}`;
  }

  if (mode === "string") {
    return `${parsed.method}(${quote(parsed.queryText)})${suffix}`;
  }

  const regex = `/${regexPattern ?? escapeRegex(parsed.queryText)}/i`;
  const root = `${parsed.method}(${regex})`;
  if (mode === "regex") return `${root}${suffix}`;
  return `${root}.filter({ hasText: ${regex} })${suffix}`;
}

function buildStableRegexPattern(value: string): string | undefined {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3)
    .filter((token) => !STABLE_STOPWORDS.has(token))
    .filter((token) => !WEATHER_OR_VOLATILE_KEYWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 4);

  if (tokens.length === 0) return undefined;
  return tokens.map((token) => escapeRegex(token)).join(".*");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getVolatilityFlags(value: string): string[] {
  const out: string[] = [];
  const normalized = value.trim().toLowerCase();
  if (!normalized) return out;

  if (/\b\d{2,}\b/.test(normalized)) out.push("contains_numeric_fragment");
  if (
    /\b\d{1,2}[:.]\d{2}\b/.test(normalized) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)
  ) {
    out.push("contains_date_or_time_fragment");
  }

  for (const keyword of WEATHER_OR_VOLATILE_KEYWORDS) {
    if (normalized.includes(keyword)) {
      out.push("contains_weather_or_news_fragment");
      break;
    }
  }

  return out;
}
