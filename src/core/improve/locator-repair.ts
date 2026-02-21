import { parseExpressionAt, type Node as AcornNode } from "acorn";
import type { Expression } from "estree";
import type { Target } from "../yaml-schema.js";
import type { ImproveDiagnostic } from "./report-schema.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { quote } from "./candidate-generator.js";
import { type DynamicSignal } from "./dynamic-target.js";
import { DYNAMIC_KEYWORDS, detectDynamicSignals } from "./dynamic-signal-detection.js";

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
  dynamicTarget: boolean;
  dynamicSignals: DynamicSignal[];
}

export function analyzeAndBuildLocatorRepairCandidates(input: {
  target: Target;
  stepNumber: number;
}): LocatorRepairAnalysis {
  if (input.target.kind !== "locatorExpression") {
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const expression = input.target.value.trim();
  const parse = parseSupportedLocatorExpression(expression);
  if (!parse) {
    if (looksPotentiallyBrittleExpression(expression)) {
      return {
        candidates: [],
        diagnostics: [
          {
            code: "selector_target_flagged_dynamic",
            level: "info",
            message:
              `Step ${input.stepNumber}: selector looked dynamic but could not be rewritten because expression shape is unsupported.`,
          },
        ],
        dynamicTarget: true,
        dynamicSignals: ["unsupported_expression_shape"],
      };
    }
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const detectedSignals = detectDynamicSignals(parse.queryText);
  const dynamicSignals: DynamicSignal[] = [];
  if (parse.exact) dynamicSignals.push("exact_true");
  if (parse.queryText.length >= 48) dynamicSignals.push("long_text");
  dynamicSignals.push(...detectedSignals.map((signal) => signal as DynamicSignal));

  if (dynamicSignals.length === 0) {
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const candidates: TargetCandidate[] = [];
  const seen = new Set<string>();
  const diagnostics: ImproveDiagnostic[] = [
    {
      code: "selector_target_flagged_dynamic",
      level: "info",
      message:
        `Step ${input.stepNumber}: selector flagged as dynamic (${dynamicSignals.join(", ")}). Trying repair variants.`,
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
      dynamicSignals: dynamicSignals.filter((signal) => signal !== "exact_true"),
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

  return {
    candidates,
    diagnostics,
    dynamicTarget: true,
    dynamicSignals,
  };
}

function looksPotentiallyBrittleExpression(expression: string): boolean {
  if (/exact\s*:\s*true/.test(expression)) return true;
  const quoted = extractFirstQuotedString(expression);
  if (!quoted) return false;
  if (quoted.length >= 48) return true;
  return detectDynamicSignals(quoted).length > 0;
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
    .filter((token) => !DYNAMIC_KEYWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 4);

  if (tokens.length === 0) return undefined;
  return tokens.map((token) => escapeRegex(token)).join(".*");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
