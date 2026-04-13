import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveLocator } from "../runtime/locator-runtime.js";
import { quote, type TargetCandidate } from "./candidate-generator.js";
import { parseSnapshotNodes } from "./assertion-candidates/assertion-candidates-snapshot.js";
import type { ImproveDiagnostic } from "./report-schema.js";
import { captureAriaSnapshot } from "./aria-snapshot-support.js";

const USELESS_ROLES = new Set(["generic", "none", "presentation"]);

const FORM_CONTROL_ROLES = new Set([
  "textbox",
  "combobox",
  "spinbutton",
  "listbox",
  "searchbox",
]);

const TEXT_ROLES = new Set(["heading", "status", "alert", "link"]);
const ROW_CONTEXT_MAX_LENGTH = 80;

interface RuntimeLocatorSignals {
  tagName: string | undefined;
  roleAttr: string | undefined;
  inputType: string | undefined;
  dataTestId: string | undefined;
  dataTestIdAlt: string | undefined;
  nameAttr: string | undefined;
  idAttr: string | undefined;
  titleAttr: string | undefined;
  rowText: string | undefined;
}

export async function generateAriaTargetCandidates(
  page: Page,
  target: Target,
  existingValues: Set<string>,
  timeoutMs: number
): Promise<{ candidates: TargetCandidate[]; diagnostics: ImproveDiagnostic[] }> {
  const candidates: TargetCandidate[] = [];
  const diagnostics: ImproveDiagnostic[] = [];

  let locator: ReturnType<typeof resolveLocator>;
  try {
    locator = resolveLocator(page, target);
  } catch (err) {
    diagnostics.push({
      code: "runtime_target_resolution_failed",
      level: "info",
      message:
        err instanceof Error
          ? "Runtime selector inspection unavailable for target: " + err.message
          : "Runtime selector inspection unavailable for target.",
    });
    return { candidates, diagnostics };
  }

  const framePath = target.framePath;
  const snapshotNode = await readPrimaryAriaSnapshotNode(locator, timeoutMs).catch((err) => {
    diagnostics.push({
      code: "aria_snapshot_failed",
      level: "info",
      message:
        err instanceof Error
          ? "Aria snapshot unavailable for target: " + err.message
          : "Aria snapshot unavailable for target.",
    });
    return undefined;
  });

  if (snapshotNode && !USELESS_ROLES.has(snapshotNode.role)) {
    const name = snapshotNode.name;

    if (name) {
      const roleValue = buildGetByRole(snapshotNode.role, name);
      pushCandidate(candidates, roleValue, framePath, existingValues, "aria_role_name", 0.9);
    }

    if (name && FORM_CONTROL_ROLES.has(snapshotNode.role)) {
      const labelValue = "getByLabel(" + quote(name) + ")";
      pushCandidate(candidates, labelValue, framePath, existingValues, "aria_label", 0.84);
    }

    if (FORM_CONTROL_ROLES.has(snapshotNode.role)) {
      try {
        const placeholder = await locator.getAttribute("placeholder", { timeout: timeoutMs });
        if (placeholder && placeholder.trim()) {
          const placeholderValue = "getByPlaceholder(" + quote(placeholder.trim()) + ")";
          pushCandidate(
            candidates,
            placeholderValue,
            framePath,
            existingValues,
            "aria_placeholder",
            0.82
          );
        }
      } catch {
        // Placeholder lookup failed — skip silently.
      }
    }

    if (name && TEXT_ROLES.has(snapshotNode.role)) {
      const textValue = "getByText(" + quote(name) + ")";
      pushCandidate(candidates, textValue, framePath, existingValues, "aria_text", 0.72);
    }
  }

  if (!hasStrongSemanticCandidate(candidates)) {
    const runtimeSignals = await readRuntimeLocatorSignals(locator).catch(() => undefined);
    if (runtimeSignals) {
      pushRuntimeSignalCandidates({
        candidates,
        existingValues,
        framePath,
        role: snapshotNode?.role ?? inferRoleFromRuntimeSignals(runtimeSignals),
        runtimeSignals,
      });
    }
  }

  return { candidates, diagnostics };
}

function hasStrongSemanticCandidate(candidates: TargetCandidate[]): boolean {
  return candidates.some((candidate) => {
    if (candidate.source !== "derived") return false;
    const confidence = candidate.target.confidence ?? 0;
    if (confidence >= 0.82) return true;

    return candidate.reasonCodes.some((reasonCode) =>
      STRONG_REASON_CODES.has(reasonCode)
    );
  });
}

const STRONG_REASON_CODES = new Set([
  "aria_role_name",
  "aria_label",
  "aria_placeholder",
  "runtime_attr_testid",
]);

async function readPrimaryAriaSnapshotNode(
  locator: ReturnType<typeof resolveLocator>,
  timeoutMs: number
) {
  const snapshotYaml = await captureAriaSnapshot(locator, {
    timeout: timeoutMs,
    depth: 0,
  });
  const nodes = parseSnapshotNodes(snapshotYaml);
  return nodes[0];
}

async function readRuntimeLocatorSignals(
  locator: ReturnType<typeof resolveLocator>
): Promise<RuntimeLocatorSignals> {
  return locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const readAttr = (name: string) => htmlElement.getAttribute(name) ?? undefined;
    const normalizeText = (value: string | null | undefined) =>
      value?.replace(/\s+/g, " ").trim() || undefined;

    const rowText = normalizeText(
      htmlElement.closest('[role="row"], tr')?.textContent
    );

    return {
      tagName: htmlElement.tagName?.toLowerCase() || undefined,
      roleAttr: readAttr("role"),
      inputType: readAttr("type"),
      dataTestId: readAttr("data-testid"),
      dataTestIdAlt: readAttr("data-test-id"),
      nameAttr: readAttr("name"),
      idAttr: readAttr("id"),
      titleAttr: readAttr("title"),
      rowText,
    };
  });
}

function pushRuntimeSignalCandidates(input: {
  candidates: TargetCandidate[];
  existingValues: Set<string>;
  framePath: string[] | undefined;
  role: string | undefined;
  runtimeSignals: RuntimeLocatorSignals;
}): void {
  const tagSelector = normalizeCssIdentifier(input.runtimeSignals.tagName) ?? "*";
  const stableTestId = normalizeAttributeValue(
    input.runtimeSignals.dataTestId ?? input.runtimeSignals.dataTestIdAlt
  );
  if (stableTestId) {
    pushCandidate(
      input.candidates,
      "getByTestId(" + quote(stableTestId) + ")",
      input.framePath,
      input.existingValues,
      "runtime_attr_testid",
      0.9
    );
  }

  const stableName = normalizeAttributeValue(input.runtimeSignals.nameAttr);
  if (stableName) {
    pushCandidate(
      input.candidates,
      "locator(" + quote(`${tagSelector}[name=${toCssQuotedValue(stableName)}]`) + ")",
      input.framePath,
      input.existingValues,
      "runtime_attr_name",
      0.72
    );
  }

  const stableId = normalizeAttributeValue(input.runtimeSignals.idAttr);
  if (stableId) {
    pushCandidate(
      input.candidates,
      "locator(" + quote(`[id=${toCssQuotedValue(stableId)}]`) + ")",
      input.framePath,
      input.existingValues,
      "runtime_attr_id",
      0.78
    );
  }

  const stableTitle = normalizeAttributeValue(input.runtimeSignals.titleAttr);
  if (stableTitle) {
    pushCandidate(
      input.candidates,
      "getByTitle(" + quote(stableTitle) + ")",
      input.framePath,
      input.existingValues,
      "runtime_attr_title",
      0.74
    );
  }

  const rowText = normalizeRowText(input.runtimeSignals.rowText);
  const role = input.role;
  if (rowText && role && FORM_CONTROL_ROLES.has(role)) {
    pushCandidate(
      input.candidates,
      `getByRole('row', { name: ${quote(rowText)} }).getByRole(${quote(role)})`,
      input.framePath,
      input.existingValues,
      "runtime_row_context",
      0.68
    );
  }
}

function inferRoleFromRuntimeSignals(
  runtimeSignals: RuntimeLocatorSignals
): string | undefined {
  if (runtimeSignals.roleAttr && !USELESS_ROLES.has(runtimeSignals.roleAttr)) {
    return runtimeSignals.roleAttr;
  }

  const tagName = runtimeSignals.tagName;
  if (!tagName) return undefined;

  switch (tagName) {
    case "textarea":
      return "textbox";
    case "select":
      return "combobox";
    case "input":
      return inferInputRole(runtimeSignals.inputType);
    default:
      return undefined;
  }
}

function inferInputRole(inputType: string | undefined): string {
  if (!inputType) return "textbox";

  switch (inputType.toLowerCase()) {
        case "checkbox":
          return "checkbox";
        case "radio":
          return "radio";
        case "search":
          return "searchbox";
        case "number":
          return "spinbutton";
        default:
          return "textbox";
  }
}

function pushCandidate(
  candidates: TargetCandidate[],
  value: string,
  framePath: string[] | undefined,
  existingValues: Set<string>,
  reasonCode: string,
  confidence?: number
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
      ...(typeof confidence === "number" ? { confidence } : {}),
    },
    source: "derived",
    reasonCodes: [reasonCode],
  });
}

function buildGetByRole(role: string, name: string): string {
  return "getByRole(" + quote(role) + ", { name: " + quote(name) + " })";
}

function normalizeAttributeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 120) return undefined;
  if (/\s{2,}/u.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeCssIdentifier(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!/^[a-z][a-z0-9-]*$/u.test(trimmed)) return undefined;
  return trimmed;
}

function toCssQuotedValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeRowText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length < 3 || trimmed.length > ROW_CONTEXT_MAX_LENGTH) return undefined;
  if (!looksStableContextLabel(trimmed)) return undefined;
  return trimmed;
}

function looksStableContextLabel(value: string): boolean {
  const tokenCount = value.split(/\s+/u).length;
  if (tokenCount > 6) return false;

  if (/\b\d{4,}\b/u.test(value)) return false;
  if (/\b\d{1,2}[:/.-]\d{1,2}(?:[:/.-]\d{2,4})?\b/u.test(value)) return false;
  if (/[A-F0-9]{8,}/iu.test(value)) return false;

  const punctuationCount = (value.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  if (punctuationCount > 6) return false;

  const digitCount = (value.match(/\d/gu) ?? []).length;
  if (digitCount > Math.max(2, Math.floor(value.length * 0.2))) return false;

  return true;
}
