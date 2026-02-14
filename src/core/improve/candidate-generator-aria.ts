import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveLocator } from "../runtime/locator-runtime.js";
import { quote, type TargetCandidate } from "./candidate-generator.js";
import { parseSnapshotNodes } from "./assertion-candidates-snapshot-cli.js";
import type { ImproveDiagnostic } from "./report-schema.js";

const USELESS_ROLES = new Set(["generic", "none", "presentation"]);

const FORM_CONTROL_ROLES = new Set([
  "textbox",
  "combobox",
  "spinbutton",
  "listbox",
  "searchbox",
]);

const TEXT_ROLES = new Set(["heading", "status", "alert", "link"]);

export async function generateAriaTargetCandidates(
  page: Page,
  target: Target,
  existingValues: Set<string>,
  timeoutMs: number
): Promise<{ candidates: TargetCandidate[]; diagnostics: ImproveDiagnostic[] }> {
  const candidates: TargetCandidate[] = [];
  const diagnostics: ImproveDiagnostic[] = [];

  let snapshotYaml: string;
  let locator: ReturnType<typeof resolveLocator>;
  try {
    locator = resolveLocator(page, target);
    snapshotYaml = await locator.ariaSnapshot({ timeout: timeoutMs });
  } catch (err) {
    diagnostics.push({
      code: "aria_snapshot_failed",
      level: "info",
      message:
        err instanceof Error
          ? "Aria snapshot unavailable for target: " + err.message
          : "Aria snapshot unavailable for target.",
    });
    return { candidates, diagnostics };
  }

  const nodes = parseSnapshotNodes(snapshotYaml);
  if (nodes.length === 0) return { candidates, diagnostics };

  const node = nodes[0];
  if (!node) return { candidates, diagnostics };
  if (USELESS_ROLES.has(node.role)) return { candidates, diagnostics };

  const name = node.name;
  const framePath = target.framePath;

  if (name) {
    const roleValue = buildGetByRole(node.role, name);
    pushCandidate(candidates, roleValue, framePath, existingValues, "aria_role_name");
  }

  if (name && FORM_CONTROL_ROLES.has(node.role)) {
    const labelValue = "getByLabel(" + quote(name) + ")";
    pushCandidate(candidates, labelValue, framePath, existingValues, "aria_label");
  }

  if (FORM_CONTROL_ROLES.has(node.role)) {
    try {
      const placeholder = await locator.getAttribute("placeholder", { timeout: timeoutMs });
      if (placeholder && placeholder.trim()) {
        const placeholderValue = "getByPlaceholder(" + quote(placeholder.trim()) + ")";
        pushCandidate(candidates, placeholderValue, framePath, existingValues, "aria_placeholder");
      }
    } catch {
      // Placeholder lookup failed — skip silently.
    }
  }

  if (name && TEXT_ROLES.has(node.role)) {
    const textValue = "getByText(" + quote(name) + ")";
    pushCandidate(candidates, textValue, framePath, existingValues, "aria_text");
  }

  return { candidates, diagnostics };
}

function pushCandidate(
  candidates: TargetCandidate[],
  value: string,
  framePath: string[] | undefined,
  existingValues: Set<string>,
  reasonCode: string
): void {
  if (existingValues.has(value)) return;
  existingValues.add(value);
  candidates.push({
    id: "aria-" + (candidates.length + 1),
    target: {
      value,
      kind: "locatorExpression",
      source: "manual",
      ...(framePath && framePath.length > 0 ? { framePath } : {}),
    },
    source: "derived",
    reasonCodes: [reasonCode],
  });
}

function buildGetByRole(role: string, name: string): string {
  return "getByRole(" + quote(role) + ", { name: " + quote(name) + " })";
}
