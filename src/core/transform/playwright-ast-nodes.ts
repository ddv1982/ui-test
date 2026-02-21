export interface AstNode {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface IdentifierNode extends AstNode {
  type: "Identifier";
  name: string;
}

export interface MemberExpressionNode extends AstNode {
  type: "MemberExpression";
  computed: boolean;
  object: unknown;
  property: unknown;
}

export interface CallExpressionNode extends AstNode {
  type: "CallExpression";
  callee: unknown;
  arguments: unknown[];
}

export interface AwaitExpressionNode extends AstNode {
  type: "AwaitExpression";
  argument: unknown;
}

export interface ArrowFunctionExpressionNode extends AstNode {
  type: "ArrowFunctionExpression";
  body: unknown;
}

export interface FunctionExpressionNode extends AstNode {
  type: "FunctionExpression";
  body: unknown;
}

export function walkAst(node: unknown, visitor: (node: AstNode) => void): void {
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

export function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function stringifyLiteralValue(value: unknown): string | null {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return null;
}

export function isCallExpression(value: unknown): value is CallExpressionNode {
  return isAstNode(value) && value.type === "CallExpression" && Array.isArray(value["arguments"]);
}

export function isAwaitExpression(value: unknown): value is AwaitExpressionNode {
  return isAstNode(value) && value.type === "AwaitExpression";
}

export function isMemberExpression(value: unknown): value is MemberExpressionNode {
  return (
    isAstNode(value) &&
    value.type === "MemberExpression" &&
    typeof value["computed"] === "boolean"
  );
}

export function isIdentifier(value: unknown): value is IdentifierNode {
  return isAstNode(value) && value.type === "Identifier" && typeof value["name"] === "string";
}

export function isArrowFunctionExpression(value: unknown): value is ArrowFunctionExpressionNode {
  return isAstNode(value) && value.type === "ArrowFunctionExpression";
}

export function isFunctionExpression(value: unknown): value is FunctionExpressionNode {
  return isAstNode(value) && value.type === "FunctionExpression";
}

export function isMemberCall(value: unknown): value is {
  callee: {
    object: unknown;
    property: IdentifierNode;
  };
  arguments: unknown[];
} {
  if (!isCallExpression(value) || !isMemberExpression(value.callee)) return false;
  return value.callee.computed === false && isIdentifier(value.callee.property);
}
