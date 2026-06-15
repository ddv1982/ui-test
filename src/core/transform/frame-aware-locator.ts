import { parseExpressionAt } from "acorn";

export interface NormalizedFrameAwareLocator {
  value: string;
  framePath: string[];
  raw: string;
}

interface CallExpressionLike {
  type: "CallExpression";
  callee: unknown;
  arguments: unknown[];
  start?: number;
  end?: number;
}

interface IdentifierLike {
  type: "Identifier";
  name: string;
  start?: number;
}

interface MemberExpressionLike {
  type: "MemberExpression";
  computed: boolean;
  object: unknown;
  property: unknown;
}

interface LiteralLike {
  type: "Literal";
  value: unknown;
}

type CallChainSegment = {
  method: string;
  propertyStart?: number;
  call: CallExpressionLike;
};

export function normalizeFrameAwareLocatorExpression(
  expression: unknown,
  source: string
): NormalizedFrameAwareLocator | undefined {
  if (!isCallExpression(expression)) return undefined;

  const chain = flattenCallChain(expression);
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

  if (framePath.length === 0 || terminalStartIndex >= chain.length) {
    return undefined;
  }

  const terminal = chain[terminalStartIndex];
  if (!terminal || typeof terminal.propertyStart !== "number") return undefined;
  if (typeof expression.end !== "number" || typeof expression.start !== "number") return undefined;

  const value = source.slice(terminal.propertyStart, expression.end).trim();
  const raw = source.slice(expression.start, expression.end).trim();
  if (!value || !raw) return undefined;

  return { value, framePath, raw };
}

export function normalizeFrameAwareLocatorSelector(
  selector: string
): NormalizedFrameAwareLocator | undefined {
  try {
    const parsed = parseExpressionAt(selector, 0, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    return normalizeFrameAwareLocatorExpression(parsed, selector);
  } catch {
    return undefined;
  }
}

function flattenCallChain(expression: CallExpressionLike): CallChainSegment[] | undefined {
  if (isIdentifier(expression.callee)) {
    return [{
      method: expression.callee.name,
      ...(typeof expression.callee.start === "number"
        ? { propertyStart: expression.callee.start }
        : {}),
      call: expression,
    }];
  }

  if (
    !isMemberExpression(expression.callee) ||
    expression.callee.computed ||
    !isIdentifier(expression.callee.property)
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

  if (isIdentifier(expression.callee.object)) {
    return [current];
  }

  return undefined;
}

function firstStringArgument(args: unknown[]): string | undefined {
  const first = args[0];
  if (!isLiteral(first) || typeof first.value !== "string") return undefined;
  return first.value;
}

function isCallExpression(node: unknown): node is CallExpressionLike {
  return !!node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "CallExpression" &&
    Array.isArray((node as { arguments?: unknown }).arguments);
}

function isMemberExpression(node: unknown): node is MemberExpressionLike {
  return !!node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "MemberExpression" &&
    typeof (node as { computed?: unknown }).computed === "boolean";
}

function isIdentifier(node: unknown): node is IdentifierLike {
  return !!node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "Identifier" &&
    typeof (node as { name?: unknown }).name === "string";
}

function isLiteral(node: unknown): node is LiteralLike {
  return !!node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "Literal";
}
