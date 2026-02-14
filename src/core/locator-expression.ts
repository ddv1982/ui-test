import { parseExpressionAt, type Node as AcornNode } from "acorn";
import type {
  ArrayExpression,
  CallExpression,
  Expression,
  Identifier,
  Literal,
  MemberExpression,
  ObjectExpression,
  Property,
} from "estree";
import { UserError } from "../utils/errors.js";

const ROOT_METHODS = new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "getByTestId",
  "frameLocator",
]);

const CHAIN_METHODS = new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByAltText",
  "getByTitle",
  "getByTestId",
  "filter",
  "first",
  "last",
  "nth",
  "and",
  "or",
  "frameLocator",
  "contentFrame",
  "owner",
]);

const EXPRESSION_HINT =
  "Use locator expressions like getByRole('button', { name: 'Save' }).nth(0), or plain CSS/XPath/text= selectors.";

type LocatorLike = object;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExpressionNode(node: AcornNode): node is AcornNode & Expression {
  return typeof (node as { type?: unknown }).type === "string";
}

function isCallExpression(node: Expression): node is CallExpression {
  return node.type === "CallExpression";
}

function isLiteral(node: Expression): node is Literal {
  return node.type === "Literal";
}

function isObjectExpression(node: Expression): node is ObjectExpression {
  return node.type === "ObjectExpression";
}

function isArrayExpression(node: Expression): node is ArrayExpression {
  return node.type === "ArrayExpression";
}

function isIdentifierNode(node: unknown): node is Identifier {
  if (!node || typeof node !== "object") return false;
  const candidate = node as { type?: unknown; name?: unknown };
  return candidate.type === "Identifier" && typeof candidate.name === "string";
}

function literalValue(node: Literal): unknown {
  const maybeRegex = node as Literal & {
    regex?: { pattern?: unknown; flags?: unknown };
  };

  if (maybeRegex.regex) {
    const pattern = maybeRegex.regex.pattern;
    const flags = maybeRegex.regex.flags;

    if (typeof pattern !== "string" || typeof flags !== "string") {
      throw new UserError("Invalid regular expression in locator selector.", EXPRESSION_HINT);
    }

    try {
      return new RegExp(pattern, flags);
    } catch {
      throw new UserError("Invalid regular expression in locator selector.", EXPRESSION_HINT);
    }
  }

  return node.value;
}

function parseSelectorExpression(selector: string): CallExpression {
  let parsed: AcornNode;

  try {
    parsed = parseExpressionAt(selector, 0, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch {
    throw new UserError(`Invalid locator expression: ${selector}`, EXPRESSION_HINT);
  }

  if (!isExpressionNode(parsed)) {
    throw new UserError(`Invalid locator expression: ${selector}`, EXPRESSION_HINT);
  }

  const remaining = selector.slice(parsed.end).trim();
  if (remaining.length > 0) {
    throw new UserError(`Invalid locator expression: ${selector}`, EXPRESSION_HINT);
  }

  if (!isCallExpression(parsed)) {
    throw new UserError("Locator expression must be a method call chain.", EXPRESSION_HINT);
  }

  return parsed;
}

function asExpression(node: unknown, selector: string): Expression {
  if (!node || typeof node !== "object" || !("type" in node)) {
    throw new UserError(
      `Unsupported syntax in locator expression: ${selector}`,
      EXPRESSION_HINT
    );
  }

  const type = String((node as { type?: unknown }).type);
  if (type === "ObjectPattern" || type === "ArrayPattern" || type === "AssignmentPattern") {
    throw new UserError(
      `Unsupported syntax in locator expression: ${selector}`,
      EXPRESSION_HINT
    );
  }

  return node as Expression;
}

function readMethod(member: MemberExpression, selector: string): string {
  if (member.computed) {
    throw new UserError(
      `Computed property access is not allowed in locator expression: ${selector}`,
      EXPRESSION_HINT
    );
  }

  if (!isIdentifierNode(member.property)) {
    throw new UserError(
      `Unsupported member access in locator expression: ${selector}`,
      EXPRESSION_HINT
    );
  }

  return member.property.name;
}

function ensureObjectPropertyKey(prop: Property, selector: string): string {
  if (prop.computed) {
    throw new UserError(
      `Computed object keys are not allowed in locator expression: ${selector}`,
      EXPRESSION_HINT
    );
  }

  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;

  throw new UserError(
    `Unsupported object key in locator expression: ${selector}`,
    EXPRESSION_HINT
  );
}

function evaluateLiteralExpression(node: Expression, root: LocatorLike, selector: string): unknown {
  if (isLiteral(node)) return literalValue(node);

  if (isArrayExpression(node)) {
    const values: unknown[] = [];

    for (const element of node.elements) {
      if (!element) {
        throw new UserError("Sparse arrays are not allowed in locator expressions.", EXPRESSION_HINT);
      }

      if (element.type === "SpreadElement") {
        throw new UserError("Spread syntax is not allowed in locator expressions.", EXPRESSION_HINT);
      }

      values.push(evaluateLiteralExpression(asExpression(element, selector), root, selector));
    }

    return values;
  }

  if (isObjectExpression(node)) {
    const result: Record<string, unknown> = {};

    for (const rawProp of node.properties) {
      if (rawProp.type !== "Property") {
        throw new UserError(
          "Only plain object properties are allowed in locator expressions.",
          EXPRESSION_HINT
        );
      }

      if (rawProp.kind !== "init" || rawProp.method || rawProp.shorthand) {
        throw new UserError(
          "Only explicit key/value object properties are allowed in locator expressions.",
          EXPRESSION_HINT
        );
      }

      const key = ensureObjectPropertyKey(rawProp, selector);
      const valueNode = rawProp.value;

      if (valueNode.type === "CallExpression") {
        result[key] = evaluateCallExpression(valueNode, root, selector, true);
      } else {
        result[key] = evaluateLiteralExpression(asExpression(valueNode, selector), root, selector);
      }
    }

    return result;
  }

  if (isCallExpression(node)) {
    return evaluateCallExpression(node, root, selector, true);
  }

  throw new UserError(
    `Unsupported syntax in locator expression: ${selector}`,
    EXPRESSION_HINT
  );
}

function callTargetMethod(
  target: LocatorLike,
  method: string,
  args: unknown[],
  selector: string
): unknown {
  const fn = (target as Record<string, unknown>)[method];

  if (typeof fn !== "function") {
    throw new UserError(
      `Method '${method}' is not available in this locator chain: ${selector}`,
      EXPRESSION_HINT
    );
  }

  return fn.call(target, ...args);
}

function evaluateCallExpression(
  call: CallExpression,
  root: LocatorLike,
  selector: string,
  fromNestedArg: boolean
): unknown {
  const args = call.arguments.map((arg) => {
    if (arg.type === "SpreadElement") {
      throw new UserError("Spread arguments are not allowed in locator expressions.", EXPRESSION_HINT);
    }
    return evaluateLiteralExpression(asExpression(arg, selector), root, selector);
  });

  const callee = call.callee;

  if (callee.type === "Identifier") {
    if (fromNestedArg && !ROOT_METHODS.has(callee.name)) {
      throw new UserError(
        `Unsupported root locator method '${callee.name}' in expression: ${selector}`,
        EXPRESSION_HINT
      );
    }

    if (!ROOT_METHODS.has(callee.name)) {
      throw new UserError(
        `Unsupported root locator method '${callee.name}' in expression: ${selector}`,
        EXPRESSION_HINT
      );
    }

    return callTargetMethod(root, callee.name, args, selector);
  }

  if (callee.type === "MemberExpression") {
    const method = readMethod(callee, selector);
    if (!CHAIN_METHODS.has(method)) {
      throw new UserError(
        `Unsupported locator chain method '${method}' in expression: ${selector}`,
        EXPRESSION_HINT
      );
    }

    if ((method === "contentFrame" || method === "owner") && args.length > 0) {
      throw new UserError(
        `Method '${method}' does not accept arguments in locator expression: ${selector}`,
        EXPRESSION_HINT
      );
    }

    const objectNode = callee.object;
    if (objectNode.type !== "CallExpression") {
      throw new UserError(
        "Locator expression chains must be built from method calls only.",
        EXPRESSION_HINT
      );
    }

    const target = evaluateCallExpression(objectNode, root, selector, false);
    if (!isRecord(target)) {
      throw new UserError("Invalid locator chain target.", EXPRESSION_HINT);
    }

    return callTargetMethod(target as LocatorLike, method, args, selector);
  }

  throw new UserError(
    `Unsupported call syntax in locator expression: ${selector}`,
    EXPRESSION_HINT
  );
}

export function looksLikeLocatorExpression(selector: string): boolean {
  return /^(locator|getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle|getByTestId|frameLocator)\s*\(/.test(
    selector.trim()
  );
}

export function evaluateLocatorExpression(root: LocatorLike, selector: string): unknown {
  const parsed = parseSelectorExpression(selector.trim());
  return evaluateCallExpression(parsed, root, selector, false);
}
