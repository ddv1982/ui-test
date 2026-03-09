import type { Target } from "../yaml-schema.js";

export interface RuntimeSelectorAdapterDependencies {
  convertSelectorFn?: (selector: string) => string | undefined;
}

export function convertRuntimeTargetToLocatorExpression(
  target: Target,
  dependencies: RuntimeSelectorAdapterDependencies = {}
): string | undefined {
  if (target.kind !== "internal" && target.kind !== "playwrightSelector") {
    return undefined;
  }

  const converter = dependencies.convertSelectorFn ?? toLocatorExpressionFromSelector;
  return converter(target.value);
}

export function toLocatorExpressionFromSelector(
  selector: string
): string | undefined {
  const terminalSelector = extractTerminalSelectorSegment(selector);
  if (!terminalSelector) return undefined;

  const internalRole = parseInternalRoleSelector(terminalSelector);
  if (internalRole?.name) {
    return `getByRole(${quote(internalRole.role)}, { name: ${quote(internalRole.name)} })`;
  }

  const engineSelector = parseEngineSelector(terminalSelector);
  if (!engineSelector) return undefined;

  switch (engineSelector.engine) {
    case "data-testid":
    case "data-test-id":
      return `getByTestId(${quote(engineSelector.body)})`;
    case "text":
      return `getByText(${quote(engineSelector.body)})`;
    case "css":
      return `locator(${quote(engineSelector.body)})`;
    case "xpath":
      return `locator(${quote(engineSelector.body.startsWith("xpath=") ? engineSelector.body : `xpath=${engineSelector.body}`)})`;
    default:
      return undefined;
  }
}

export function shouldRetainFramePath(
  locatorExpression: string,
  framePath: string[] | undefined
): boolean {
  if (!framePath || framePath.length === 0) return false;
  if (locatorExpression.startsWith("frameLocator(")) return false;
  if (locatorExpression.includes(".frameLocator(")) return false;
  if (locatorExpression.startsWith("contentFrame(")) return false;
  if (locatorExpression.includes(".contentFrame(")) return false;
  return true;
}

function extractTerminalSelectorSegment(selector: string): string | undefined {
  const parts = selector
    .split(/\s*>>\s*/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index];
    if (!candidate || candidate.startsWith("internal:control=enter-frame")) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function parseEngineSelector(
  selector: string
): { engine: string; body: string } | undefined {
  const index = selector.indexOf("=");
  if (index <= 0) return undefined;
  const engine = selector.slice(0, index).trim();
  const rawBody = selector.slice(index + 1).trim();
  if (!engine || !rawBody) return undefined;
  const body = unquote(rawBody) ?? rawBody;
  return body ? { engine, body } : undefined;
}

function parseInternalRoleSelector(
  selector: string
): { role: string; name?: string } | undefined {
  const match = /^internal:role=([^[\s]+)(?:\[(.+)\])?$/u.exec(selector);
  if (!match?.[1]) return undefined;
  const role = match[1].trim();
  const attrs = match[2]?.trim();
  if (!role) return undefined;
  if (!attrs) return { role };

  const nameMatch = /name=(?:"([^"]*)"|'([^']*)'|([^\]\s]+))(?:[is])?/u.exec(attrs);
  const rawName = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3];
  const name = rawName ? unescapeSelectorValue(rawName) : undefined;
  return name ? { role, name } : { role };
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

function unquote(value: string): string | undefined {
  if (value.length < 2) return undefined;
  const quoteChar = value[0];
  if ((quoteChar !== "'" && quoteChar !== '"') || value[value.length - 1] !== quoteChar) {
    return undefined;
  }
  return unescapeSelectorValue(value.slice(1, -1));
}

function unescapeSelectorValue(value: string): string {
  return value
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}
