import { parse } from "acorn";
import type { Step, Target } from "../yaml-schema.js";
import { classifySelector } from "../selector-classifier.js";

interface AstNode {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

interface IdentifierNode extends AstNode {
  type: "Identifier";
  name: string;
}

interface MemberExpressionNode extends AstNode {
  type: "MemberExpression";
  computed: boolean;
  object: unknown;
  property: unknown;
}

interface CallExpressionNode extends AstNode {
  type: "CallExpression";
  callee: unknown;
  arguments: unknown[];
}

interface AwaitExpressionNode extends AstNode {
  type: "AwaitExpression";
  argument: unknown;
}

interface ArrowFunctionExpressionNode extends AstNode {
  type: "ArrowFunctionExpression";
  body: unknown;
}

interface FunctionExpressionNode extends AstNode {
  type: "FunctionExpression";
  body: unknown;
}

export function playwrightCodeToSteps(code: string): Step[] {
  let ast: unknown;
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      ranges: false,
    });
  } catch {
    return [];
  }

  const steps: Step[] = [];
  const callbackBodies = collectTestCallbackBodies(ast);
  for (const body of callbackBodies) {
    walkAst(body, (node) => {
      if (!isAwaitExpression(node) || !isCallExpression(node.argument)) return;
      const step = awaitedCallToStep(node.argument, code);
      if (step) steps.push(step);
    });
  }

  return steps;
}

function collectTestCallbackBodies(ast: unknown): unknown[] {
  const callbackBodies: unknown[] = [];

  walkAst(ast, (node) => {
    if (!isCallExpression(node)) return;

    const callback = getTestCallback(node);
    if (!callback) return;
    callbackBodies.push(callback.body);
  });

  if (callbackBodies.length > 0) return callbackBodies;
  return [ast];
}

function getTestCallback(call: CallExpressionNode): ArrowFunctionExpressionNode | FunctionExpressionNode | null {
  if (!isTestCallCallee(call.callee)) return null;
  if (!Array.isArray(call.arguments) || call.arguments.length === 0) return null;

  for (let index = call.arguments.length - 1; index >= 0; index -= 1) {
    const arg = call.arguments[index];
    if (isArrowFunctionExpression(arg) || isFunctionExpression(arg)) {
      return arg;
    }
  }

  return null;
}

function isTestCallCallee(callee: unknown): boolean {
  if (isIdentifier(callee) && callee.name === "test") {
    return true;
  }

  if (
    isMemberExpression(callee) &&
    !callee.computed &&
    isIdentifier(callee.object) &&
    callee.object.name === "test" &&
    isIdentifier(callee.property)
  ) {
    return true;
  }

  return false;
}

function walkAst(node: unknown, visitor: (node: AstNode) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visitor);
    return;
  }

  if (isAstNode(node)) {
    visitor(node);
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    walkAst(value, visitor);
  }
}

function awaitedCallToStep(call: CallExpressionNode, source: string): Step | null {
  if (!isMemberCall(call)) return null;
  const methodName = call.callee.property.name;

  if (methodName === "goto") {
    const url = firstStringArgument(call.arguments, source);
    if (!url) return null;
    return { action: "navigate", url };
  }

  if (["click", "fill", "press", "check", "uncheck", "hover", "selectOption"].includes(methodName)) {
    const target = expressionToTarget(call.callee.object, source);
    if (!target) return null;

    if (methodName === "click") return { action: "click", target };
    if (methodName === "check") return { action: "check", target };
    if (methodName === "uncheck") return { action: "uncheck", target };
    if (methodName === "hover") return { action: "hover", target };
    if (methodName === "fill") {
      return { action: "fill", target, text: firstStringArgument(call.arguments, source) ?? "" };
    }
    if (methodName === "press") {
      return { action: "press", target, key: firstStringArgument(call.arguments, source) ?? "" };
    }
    if (methodName === "selectOption") {
      return {
        action: "select",
        target,
        value: extractSelectOptionValue(call.arguments[0], source),
      };
    }
  }

  return expectCallToStep(call, source);
}

function expectCallToStep(call: CallExpressionNode, source: string): Step | null {
  if (!isMemberCall(call)) return null;
  const assertionName = call.callee.property.name;
  let expectTarget: unknown = call.callee.object;
  let negated = false;

  if (
    isMemberExpression(expectTarget) &&
    !expectTarget.computed &&
    isIdentifier(expectTarget.property) &&
    expectTarget.property.name === "not"
  ) {
    negated = true;
    expectTarget = expectTarget.object;
  }

  if (
    !isCallExpression(expectTarget) ||
    !isIdentifier(expectTarget.callee) ||
    expectTarget.callee.name !== "expect"
  ) {
    return null;
  }

  const expectedTarget = expressionToTarget(expectTarget.arguments[0], source);
  if (!expectedTarget) return null;

  if (assertionName === "toBeVisible" && !negated) {
    return { action: "assertVisible", target: expectedTarget };
  }

  if ((assertionName === "toContainText" || assertionName === "toHaveText") && !negated) {
    return {
      action: "assertText",
      target: expectedTarget,
      text: firstStringArgument(call.arguments, source) ?? "",
    };
  }

  if (assertionName === "toHaveValue" && !negated) {
    return {
      action: "assertValue",
      target: expectedTarget,
      value: firstStringArgument(call.arguments, source) ?? "",
    };
  }

  if (assertionName === "toBeChecked") {
    return {
      action: "assertChecked",
      target: expectedTarget,
      checked: !negated,
    };
  }

  return null;
}

function expressionToSelector(expression: unknown, source: string): string | null {
  if (!isAstNode(expression) || typeof expression.start !== "number" || typeof expression.end !== "number") {
    return null;
  }

  const full = source.slice(expression.start, expression.end).trim();
  if (!full) return null;

  const withoutAlias = full.replace(/^[A-Za-z_$][A-Za-z0-9_$]*\./u, "");
  return withoutAlias.trim() || null;
}

function expressionToTarget(expression: unknown, source: string): Target | null {
  const selector = expressionToSelector(expression, source);
  if (!selector) return null;
  return {
    value: selector,
    kind: classifySelector(selector).kind,
    source: "codegen-fallback",
  };
}

function firstStringArgument(argumentsList: unknown, source: string): string | null {
  if (!Array.isArray(argumentsList) || argumentsList.length === 0) return null;
  const first = argumentsList[0];
  if (!first || typeof first !== "object") return null;

  const firstNode = first as AstNode;
  if (firstNode.type === "Literal" && typeof firstNode.value === "string") {
    return firstNode.value;
  }

  if (
    firstNode.type === "TemplateLiteral" &&
    Array.isArray(firstNode.expressions) &&
    firstNode.expressions.length === 0 &&
    Array.isArray(firstNode.quasis)
  ) {
    const firstQuasi = firstNode.quasis[0] as { value?: { cooked?: string } } | undefined;
    return firstQuasi?.value?.cooked ?? null;
  }

  if (typeof firstNode.start === "number" && typeof firstNode.end === "number") {
    const raw = source.slice(firstNode.start, firstNode.end).trim();
    if (raw.startsWith("'") || raw.startsWith('"') || raw.startsWith("`")) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  return null;
}

function extractSelectOptionValue(argument: unknown, source: string): string {
  if (!argument || typeof argument !== "object") return "";
  const node = argument as AstNode;

  if (node.type === "Literal" && node.value != null) {
    return String(node.value);
  }

  if (node.type === "ArrayExpression" && Array.isArray(node.elements)) {
    const first = node.elements[0] as AstNode | undefined;
    if (first?.type === "Literal" && first.value != null) {
      return String(first.value);
    }
    return "";
  }

  if (node.type === "ObjectExpression" && Array.isArray(node.properties)) {
    const prop = node.properties.find((entry): entry is AstNode => {
      if (!entry || typeof entry !== "object") return false;
      const propNode = entry as AstNode;
      if (propNode.type !== "Property" || propNode.computed !== false) return false;
      return (
        isIdentifier(propNode.key) &&
        (propNode.key.name === "value" || propNode.key.name === "label")
      );
    });

    const valueNode = prop?.value as AstNode | undefined;
    if (valueNode?.type === "Literal" && valueNode.value != null) {
      return String(valueNode.value);
    }
  }

  if (typeof node.start === "number" && typeof node.end === "number") {
    return source.slice(node.start, node.end).trim();
  }
  return "";
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function isCallExpression(value: unknown): value is CallExpressionNode {
  return isAstNode(value) && value.type === "CallExpression" && Array.isArray(value.arguments);
}

function isAwaitExpression(value: unknown): value is AwaitExpressionNode {
  return isAstNode(value) && value.type === "AwaitExpression";
}

function isMemberExpression(value: unknown): value is MemberExpressionNode {
  return (
    isAstNode(value) &&
    value.type === "MemberExpression" &&
    typeof value.computed === "boolean"
  );
}

function isIdentifier(value: unknown): value is IdentifierNode {
  return isAstNode(value) && value.type === "Identifier" && typeof value.name === "string";
}

function isArrowFunctionExpression(value: unknown): value is ArrowFunctionExpressionNode {
  return isAstNode(value) && value.type === "ArrowFunctionExpression";
}

function isFunctionExpression(value: unknown): value is FunctionExpressionNode {
  return isAstNode(value) && value.type === "FunctionExpression";
}

function isMemberCall(value: unknown): value is {
  callee: {
    object: unknown;
    property: IdentifierNode;
  };
  arguments: unknown[];
} {
  if (!isCallExpression(value) || !isMemberExpression(value.callee)) return false;
  return value.callee.computed === false && isIdentifier(value.callee.property);
}
