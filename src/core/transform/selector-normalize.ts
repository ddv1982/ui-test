export interface JsonlLocatorNode {
  kind: string;
  body?: unknown;
  options?: Record<string, unknown>;
  next?: JsonlLocatorNode;
}

export function locatorNodeToExpression(node: unknown, depth = 0): string | undefined {
  if (!isLocatorNode(node) || depth > 64) return undefined;

  const { kind, body, options = {}, next } = node;
  let current: string;

  switch (kind) {
    case "default": {
      const hasText = options["hasText"];
      const hasNotText = options["hasNotText"];
      if (hasText !== undefined) {
        current = `locator(${toLiteral(body)}, { hasText: ${toLiteral(hasText)} })`;
      } else if (hasNotText !== undefined) {
        current = `locator(${toLiteral(body)}, { hasNotText: ${toLiteral(hasNotText)} })`;
      } else {
        current = `locator(${toLiteral(body)})`;
      }
      break;
    }

    case "frame-locator":
      current = `frameLocator(${toLiteral(body)})`;
      break;

    case "frame":
      current = "contentFrame()";
      break;

    case "nth": {
      const nthIndex = typeof body === "number" ? body : Number(body);
      if (!Number.isFinite(nthIndex)) return undefined;
      current = `nth(${nthIndex})`;
      break;
    }

    case "first":
      current = "first()";
      break;

    case "last":
      current = "last()";
      break;

    case "visible":
      current = `filter({ visible: ${body === true || body === "true" ? "true" : "false"} })`;
      break;

    case "role": {
      const roleOptions: string[] = [];
      if (options["name"] !== undefined) {
        roleOptions.push(`name: ${toLiteral(options["name"])}`);
      }
      if (options["exact"] === true) roleOptions.push("exact: true");
      const attrs = Array.isArray(options["attrs"])
        ? options["attrs"].filter(
            (value): value is { name: unknown; value: unknown } => isPlainObject(value)
          )
        : [];
      for (const attr of attrs) {
        if (typeof attr.name !== "string") continue;
        roleOptions.push(`${safeObjectKey(attr.name)}: ${toLiteral(attr.value)}`);
      }
      current =
        roleOptions.length > 0
          ? `getByRole(${toLiteral(body)}, { ${roleOptions.join(", ")} })`
          : `getByRole(${toLiteral(body)})`;
      break;
    }

    case "has-text":
      current = `filter({ hasText: ${toLiteral(body)} })`;
      break;

    case "has-not-text":
      current = `filter({ hasNotText: ${toLiteral(body)} })`;
      break;

    case "has": {
      const nested = locatorNodeToExpression(body, depth + 1);
      if (!nested) return undefined;
      current = `filter({ has: ${nested} })`;
      break;
    }

    case "hasNot": {
      const nested = locatorNodeToExpression(body, depth + 1);
      if (!nested) return undefined;
      current = `filter({ hasNot: ${nested} })`;
      break;
    }

    case "and": {
      const nested = locatorNodeToExpression(body, depth + 1);
      if (!nested) return undefined;
      current = `and(${nested})`;
      break;
    }

    case "or": {
      const nested = locatorNodeToExpression(body, depth + 1);
      if (!nested) return undefined;
      current = `or(${nested})`;
      break;
    }

    case "chain": {
      const nested = locatorNodeToExpression(body, depth + 1);
      if (!nested) return undefined;
      current = `locator(${nested})`;
      break;
    }

    case "test-id":
      current = `getByTestId(${toLiteral(body)})`;
      break;

    case "text":
      current = toGetByTextMethod("getByText", body, options);
      break;

    case "alt":
      current = toGetByTextMethod("getByAltText", body, options);
      break;

    case "placeholder":
      current = toGetByTextMethod("getByPlaceholder", body, options);
      break;

    case "label":
      current = toGetByTextMethod("getByLabel", body, options);
      break;

    case "title":
      current = toGetByTextMethod("getByTitle", body, options);
      break;

    default:
      return undefined;
  }

  if (!next) return current;
  const nextExpression = locatorNodeToExpression(next, depth + 1);
  if (!nextExpression) return current;
  return `${current}.${nextExpression}`;
}

function toGetByTextMethod(
  methodName: "getByText" | "getByAltText" | "getByPlaceholder" | "getByLabel" | "getByTitle",
  body: unknown,
  options: Record<string, unknown>
): string {
  if (options["exact"] === true) {
    return `${methodName}(${toLiteral(body)}, { exact: true })`;
  }
  return `${methodName}(${toLiteral(body)})`;
}

function toLiteral(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") return quote(value);
  if (Array.isArray(value)) return `[${value.map((entry) => toLiteral(entry)).join(", ")}]`;
  if (isRegexLike(value)) return `/${escapeRegexBody(value.source)}/${value.flags}`;
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${safeObjectKey(key)}: ${toLiteral(entry)}`
    );
    return `{ ${entries.join(", ")} }`;
  }
  return quote(formatFallbackLiteral(value));
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

function safeObjectKey(key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)) return key;
  return quote(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocatorNode(value: unknown): value is JsonlLocatorNode {
  return isPlainObject(value) && typeof value["kind"] === "string";
}

function isRegexLike(value: unknown): value is { source: string; flags: string } {
  return (
    isPlainObject(value) &&
    typeof value["source"] === "string" &&
    typeof value["flags"] === "string"
  );
}

function escapeRegexBody(value: string): string {
  return value.replace(/\//g, "\\/");
}

function formatFallbackLiteral(value: unknown): string {
  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()";
  }
  return Object.prototype.toString.call(value);
}
