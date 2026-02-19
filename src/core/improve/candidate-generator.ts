import type { Target } from "../yaml-schema.js";

export interface TargetCandidate {
  id: string;
  target: Target;
  source: "current" | "derived";
  reasonCodes: string[];
}

export function generateTargetCandidates(target: Target): TargetCandidate[] {
  const candidates: TargetCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (
    candidateTarget: Target,
    source: "current" | "derived",
    reasonCodes: string[]
  ) => {
    const key = stableTargetKey(candidateTarget);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `${source}-${candidates.length + 1}`,
      target: candidateTarget,
      source,
      reasonCodes,
    });
  };

  pushCandidate(target, "current", ["existing_target"]);

  const derived = deriveTargets(target);
  for (const item of derived) {
    pushCandidate(item.target, "derived", item.reasonCodes);
  }

  return candidates;
}

function deriveTargets(target: Target): Array<{ target: Target; reasonCodes: string[] }> {
  const out: Array<{ target: Target; reasonCodes: string[] }> = [];
  const value = target.value.trim();

  if (!value) return out;

  if (target.kind === "playwrightSelector") {
    const parsed = parseEngineSelector(value);
    if (parsed?.engine === "data-testid" && parsed.body) {
      out.push({
        target: {
          value: `getByTestId(${quote(parsed.body)})`,
          kind: "locatorExpression",
          source: "manual",
          ...(target.framePath ? { framePath: target.framePath } : {}),
        },
        reasonCodes: ["engine_data_testid_to_expression"],
      });
    } else if (parsed?.engine === "text" && parsed.body) {
      out.push({
        target: {
          value: `getByText(${quote(parsed.body)})`,
          kind: "locatorExpression",
          source: "manual",
          ...(target.framePath ? { framePath: target.framePath } : {}),
        },
        reasonCodes: ["engine_text_to_expression"],
      });
    } else if (parsed?.engine === "css" && parsed.body) {
      out.push({
        target: {
          value: `locator(${quote(parsed.body)})`,
          kind: "locatorExpression",
          source: "manual",
          ...(target.framePath ? { framePath: target.framePath } : {}),
        },
        reasonCodes: ["engine_css_to_expression"],
      });
    }
  }

  if (target.kind === "css") {
    out.push({
      target: {
        value: `locator(${quote(value)})`,
        kind: "locatorExpression",
        source: "manual",
        ...(target.framePath ? { framePath: target.framePath } : {}),
      },
      reasonCodes: ["css_to_locator_expression"],
    });

    const testId = parseCssTestId(value);
    if (testId) {
      out.push({
        target: {
          value: `getByTestId(${quote(testId)})`,
          kind: "locatorExpression",
          source: "manual",
          ...(target.framePath ? { framePath: target.framePath } : {}),
        },
        reasonCodes: ["css_testid_to_expression"],
      });
    }
  }

  if (target.kind === "xpath") {
    const normalizedXpath = value.startsWith("xpath=") ? value : `xpath=${value}`;
    out.push({
      target: {
        value: `locator(${quote(normalizedXpath)})`,
        kind: "locatorExpression",
        source: "manual",
        ...(target.framePath ? { framePath: target.framePath } : {}),
      },
      reasonCodes: ["xpath_to_locator_expression"],
    });
  }

  return out;
}

function parseEngineSelector(selector: string): { engine: string; body: string } | null {
  const idx = selector.indexOf("=");
  if (idx <= 0) return null;
  const engine = selector.slice(0, idx).trim();
  const body = selector.slice(idx + 1).trim();
  if (!engine || !body) return null;
  return { engine, body };
}

function parseCssTestId(selector: string): string | undefined {
  const patterns = [
    /^\[data-testid=['"]([^'"]+)['"]\]$/u,
    /^\[data-test-id=['"]([^'"]+)['"]\]$/u,
  ];
  for (const pattern of patterns) {
    const match = selector.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

export function stableTargetKey(target: Target): string {
  return JSON.stringify({
    value: target.value,
    kind: target.kind,
    source: target.source,
    framePath: target.framePath ?? [],
  });
}
