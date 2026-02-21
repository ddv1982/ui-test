import type { Step, Target } from "../yaml-schema.js";
import { quote } from "./candidate-generator.js";

export interface SnapshotNode {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  visible: boolean;
  enabled: boolean;
  expanded?: boolean;
  rawLine: string;
}

export const VISIBLE_ROLE_ALLOWLIST = new Set([
  "alert",
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "heading",
  "link",
  "menuitem",
  "navigation",
  "radio",
  "status",
  "switch",
  "tab",
  "textbox",
]);

export const STABLE_STRUCTURAL_ROLES = new Set([
  "navigation",
  "banner",
  "main",
  "contentinfo",
]);

export const TEXT_ROLE_ALLOWLIST = new Set([
  "heading",
  "status",
  "alert",
  "tab",
  "link",
]);

export const STATE_CHANGE_ROLE_ALLOWLIST = new Set([
  "button",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "link",
]);

export const MAX_TEXT_CANDIDATES_PER_STEP = 2;
export const MAX_VISIBLE_CANDIDATES_PER_STEP = 3;
export const MAX_STATE_CANDIDATES_PER_STEP = 2;

export function buildRoleTarget(
  role: string,
  name: string,
  framePath: string[] | undefined
): Target {
  return {
    value: "getByRole(" + quote(role) + ", { name: " + quote(name) + " })",
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

export function buildTextTarget(
  node: SnapshotNode,
  text: string,
  framePath: string[] | undefined
): Target {
  const value =
    node.name && VISIBLE_ROLE_ALLOWLIST.has(node.role)
      ? "getByRole(" + quote(node.role) + ", { name: " + quote(node.name) + " })"
      : "getByText(" + quote(text) + ")";

  return {
    value,
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

export function extractActedTargetHint(step: Step): string {
  if (step.action === "navigate") return step.url;
  if (step.action === "assertUrl") return step.url;
  if (step.action === "assertTitle") return step.title;
  if ("target" in step && step.target) return step.target.value;
  return "";
}

export function matchesActedTarget(value: string, actedTargetHint: string): boolean {
  const normalizedValue = normalizeForCompare(value);
  const normalizedTarget = normalizeForCompare(actedTargetHint);
  if (!normalizedValue || !normalizedTarget) return false;
  return (
    normalizedTarget.includes(normalizedValue) ||
    normalizedValue.includes(normalizedTarget)
  );
}

export function nodeSignature(node: SnapshotNode): string {
  return [
    node.role,
    normalizeForCompare(node.name ?? ""),
    normalizeForCompare(node.text ?? ""),
    node.visible ? "v" : "h",
    node.enabled ? "e" : "d",
  ].join("|");
}

export function nodeIdentityKey(node: SnapshotNode): string {
  if (node.ref) {
    return `ref:${normalizeForCompare(node.ref)}`;
  }
  return [
    node.role,
    normalizeForCompare(node.name ?? ""),
  ].join("|");
}

export function isNoisyText(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 120) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (!/[a-zA-Z]/.test(text)) return true;
  return false;
}

export function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function textRolePriority(role: string): number {
  switch (role) {
    case "heading":
      return 0;
    case "alert":
      return 1;
    case "status":
      return 2;
    case "tab":
      return 3;
    case "link":
      return 4;
    default:
      return 5;
  }
}

export function visibleRolePriority(role: string): number {
  switch (role) {
    case "heading":
      return 0;
    case "dialog":
      return 1;
    case "alert":
      return 2;
    case "link":
      return 3;
    case "button":
      return 4;
    case "tab":
      return 5;
    default:
      return 6;
  }
}

export function stableStructuralRolePriority(role: string): number {
  switch (role) {
    case "navigation":
      return 0;
    case "banner":
      return 1;
    case "main":
      return 2;
    case "contentinfo":
      return 3;
    default:
      return 5;
  }
}
