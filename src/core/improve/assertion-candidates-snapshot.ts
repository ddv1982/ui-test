import type { Step, Target } from "../yaml-schema.js";
import { quote } from "./candidate-generator.js";
import type { AssertionCandidate, AssertionCandidateSource } from "./report-schema.js";

interface SnapshotNode {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  rawLine: string;
}

const VISIBLE_ROLE_ALLOWLIST = new Set([
  "alert",
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "heading",
  "link",
  "menuitem",
  "radio",
  "status",
  "switch",
  "tab",
  "textbox",
]);

const TEXT_ROLE_ALLOWLIST = new Set(["heading", "status", "alert", "tab", "link"]);

const MAX_TEXT_CANDIDATES_PER_STEP = 2;
const MAX_VISIBLE_CANDIDATES_PER_STEP = 3;

export interface StepSnapshot {
  index: number;
  step: Step;
  preSnapshot: string;
  postSnapshot: string;
}

export function buildSnapshotAssertionCandidates(
  snapshots: StepSnapshot[],
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    const preNodes = parseSnapshotNodes(snapshot.preSnapshot);
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    const delta = buildDeltaNodes(preNodes, postNodes);
    if (delta.length === 0) continue;

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action === "navigate" ? undefined : snapshot.step.target.framePath;

    const textCandidates = buildTextCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_TEXT_CANDIDATES_PER_STEP
    );
    candidates.push(...textCandidates);

    const textTargetValues = new Set(
      textCandidates.map((c) =>
        normalizeForCompare(
          c.candidate.action !== "navigate" ? c.candidate.target.value : ""
        )
      )
    );

    const visibleCandidates = buildVisibleCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_VISIBLE_CANDIDATES_PER_STEP
    );
    for (const vc of visibleCandidates) {
      const vcTarget =
        vc.candidate.action !== "navigate"
          ? normalizeForCompare(vc.candidate.target.value)
          : "";
      if (textTargetValues.has(vcTarget)) continue;
      candidates.push(vc);
    }
  }

  return candidates;
}

export function parseSnapshotNodes(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];
  const lines = snapshot.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;

    const content = trimmed.slice(2);
    if (content.startsWith("/")) continue;

    const roleMatch = /^([a-zA-Z][a-zA-Z0-9_-]*)/.exec(content);
    if (!roleMatch) continue;

    const role = roleMatch[1];
    const refMatch = /\[ref=([^\]]+)\]/.exec(content);
    const nameMatch = /"([^"]+)"/.exec(content);
    const textMatch = /: (.+)$/.exec(content);

    const name = nameMatch?.[1]?.trim();
    const text = textMatch?.[1]?.trim();
    nodes.push({
      role,
      name: name || undefined,
      text: text || undefined,
      ref: refMatch?.[1],
      rawLine: trimmed,
    });
  }

  return nodes;
}

function buildDeltaNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => !preKeys.has(nodeSignature(node)));
}

function buildVisibleCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying: SnapshotNode[] = [];
  for (const node of nodes) {
    if (!VISIBLE_ROLE_ALLOWLIST.has(node.role)) continue;
    if (!node.name || isNoisyText(node.name)) continue;
    if (matchesActedTarget(node.name, actedTargetHint)) continue;
    qualifying.push(node);
  }

  qualifying.sort((a, b) => visibleRolePriority(a.role) - visibleRolePriority(b.role));

  return qualifying.slice(0, maxCount).map((node) => ({
    index,
    afterAction,
    candidate: {
      action: "assertVisible" as const,
      target: buildRoleTarget(node.role, node.name!, framePath),
    },
    confidence: 0.78,
    rationale: "Snapshot delta found a new role/name element after this step.",
    candidateSource,
  }));
}

function buildTextCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying: { node: SnapshotNode; text: string }[] = [];
  for (const node of nodes) {
    if (!TEXT_ROLE_ALLOWLIST.has(node.role)) continue;
    const text = (node.text ?? node.name ?? "").trim();
    if (!text || isNoisyText(text)) continue;
    if (matchesActedTarget(text, actedTargetHint)) continue;
    qualifying.push({ node, text });
  }

  qualifying.sort((a, b) => textRolePriority(a.node.role) - textRolePriority(b.node.role));

  return qualifying.slice(0, maxCount).map(({ node, text }) => ({
    index,
    afterAction,
    candidate: {
      action: "assertText" as const,
      target: buildTextTarget(node, text, framePath),
      text,
    },
    confidence: 0.82,
    rationale: "Snapshot delta identified new high-signal text after this step.",
    candidateSource,
  }));
}

function buildRoleTarget(
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

function buildTextTarget(
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

function extractActedTargetHint(step: Step): string {
  if (step.action === "navigate") return step.url;
  return step.target.value;
}

function matchesActedTarget(value: string, actedTargetHint: string): boolean {
  const normalizedValue = normalizeForCompare(value);
  const normalizedTarget = normalizeForCompare(actedTargetHint);
  if (!normalizedValue || !normalizedTarget) return false;
  return (
    normalizedTarget.includes(normalizedValue) ||
    normalizedValue.includes(normalizedTarget)
  );
}

function nodeSignature(node: SnapshotNode): string {
  return [
    node.role,
    normalizeForCompare(node.name ?? ""),
    normalizeForCompare(node.text ?? ""),
  ].join("|");
}

function isNoisyText(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 120) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (!/[a-zA-Z]/.test(text)) return true;
  return false;
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function textRolePriority(role: string): number {
  switch (role) {
    case "heading": return 0;
    case "alert": return 1;
    case "status": return 2;
    case "tab": return 3;
    case "link": return 4;
    default: return 5;
  }
}

function visibleRolePriority(role: string): number {
  switch (role) {
    case "heading": return 0;
    case "dialog": return 1;
    case "alert": return 2;
    case "link": return 3;
    case "button": return 4;
    case "tab": return 5;
    default: return 6;
  }
}
