import type { Target } from "../yaml-schema.js";
import { quote } from "./candidate-generator.js";
import {
  parseSnapshotNodes,
  type StepSnapshot,
} from "./assertion-candidates-snapshot.js";
import type { AssertionCandidate } from "./report-schema.js";

const INVENTORY_TEXT_ROLES = new Set([
  "heading",
  "status",
  "alert",
  "link",
  "tab",
]);

const INVENTORY_VISIBLE_ROLES = new Set([
  "navigation",
  "banner",
  "main",
  "contentinfo",
  "dialog",
  "status",
  "alert",
]);

const MAX_INVENTORY_CANDIDATES_PER_STEP = 2;
const INVENTORY_TEXT_CONFIDENCE = 0.79;
const INVENTORY_VISIBLE_CONFIDENCE = 0.77;

type SnapshotInventoryNode = ReturnType<typeof parseSnapshotNodes>[number];

export function buildSnapshotInventoryAssertionCandidates(
  snapshots: StepSnapshot[]
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    if (postNodes.length === 0) continue;

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action === "navigate"
        ? undefined
        : snapshot.step.target.framePath;

    const textCandidates = buildInventoryTextCandidates(
      snapshot.index,
      snapshot.step.action,
      postNodes,
      actedTargetHint,
      framePath
    );
    const visibleCandidates = buildInventoryVisibleCandidates(
      snapshot.index,
      snapshot.step.action,
      postNodes,
      actedTargetHint,
      framePath,
      new Set(
        textCandidates
          .filter((candidate) => candidate.candidate.action !== "navigate")
          .map((candidate) => normalizeForCompare(candidate.candidate.target.value))
      )
    );

    for (const candidate of textCandidates) {
      if (candidatesForStep(candidates, snapshot.index) >= MAX_INVENTORY_CANDIDATES_PER_STEP) {
        break;
      }
      candidates.push(candidate);
    }

    for (const candidate of visibleCandidates) {
      if (candidatesForStep(candidates, snapshot.index) >= MAX_INVENTORY_CANDIDATES_PER_STEP) {
        break;
      }
      candidates.push(candidate);
    }
  }

  return candidates;
}

function candidatesForStep(candidates: AssertionCandidate[], stepIndex: number): number {
  let count = 0;
  for (const candidate of candidates) {
    if (candidate.index === stepIndex) count += 1;
  }
  return count;
}

function buildInventoryTextCandidates(
  index: number,
  afterAction: AssertionCandidate["afterAction"],
  nodes: SnapshotInventoryNode[],
  actedTargetHint: string,
  framePath: string[] | undefined
): AssertionCandidate[] {
  const qualifying: { node: SnapshotInventoryNode; text: string }[] = [];
  for (const node of nodes) {
    if (!INVENTORY_TEXT_ROLES.has(node.role)) continue;
    const text = (node.text ?? node.name ?? "").trim();
    if (!text || isNoisyText(text)) continue;
    if (matchesActedTarget(text, actedTargetHint)) continue;
    qualifying.push({ node, text });
  }

  qualifying.sort((left, right) => textRolePriority(left.node.role) - textRolePriority(right.node.role));

  const out: AssertionCandidate[] = [];
  const seenTargets = new Set<string>();
  for (const { node, text } of qualifying) {
    const target = buildTextTarget(node, text, framePath);
    const targetKey = normalizeForCompare(target.value);
    if (!targetKey || seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    out.push({
      index,
      afterAction,
      candidate: {
        action: "assertText",
        target,
        text,
      },
      confidence: INVENTORY_TEXT_CONFIDENCE,
      rationale:
        "Coverage fallback (inventory): full post-step aria inventory yielded high-signal text.",
      candidateSource: "snapshot_native",
      coverageFallback: true,
    });
  }
  return out;
}

function buildInventoryVisibleCandidates(
  index: number,
  afterAction: AssertionCandidate["afterAction"],
  nodes: SnapshotInventoryNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  excludedTargetKeys: Set<string>
): AssertionCandidate[] {
  const qualifying: SnapshotInventoryNode[] = [];
  for (const node of nodes) {
    if (!INVENTORY_VISIBLE_ROLES.has(node.role)) continue;
    if (!node.name || isNoisyText(node.name)) continue;
    if (matchesActedTarget(node.name, actedTargetHint)) continue;
    qualifying.push(node);
  }

  qualifying.sort(
    (left, right) => visibleRolePriority(left.role) - visibleRolePriority(right.role)
  );

  const out: AssertionCandidate[] = [];
  const seenTargets = new Set<string>(excludedTargetKeys);
  for (const node of qualifying) {
    const target = buildRoleTarget(node.role, node.name!, framePath);
    const targetKey = normalizeForCompare(target.value);
    if (!targetKey || seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    out.push({
      index,
      afterAction,
      candidate: {
        action: "assertVisible",
        target,
      },
      confidence: INVENTORY_VISIBLE_CONFIDENCE,
      rationale:
        "Coverage fallback (inventory): full post-step aria inventory found stable landmark visibility.",
      candidateSource: "snapshot_native",
      coverageFallback: true,
    });
  }
  return out;
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
  node: SnapshotInventoryNode,
  text: string,
  framePath: string[] | undefined
): Target {
  const value = node.name
    ? "getByRole(" + quote(node.role) + ", { name: " + quote(node.name) + " })"
    : "getByText(" + quote(text) + ")";

  return {
    value,
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

function extractActedTargetHint(
  step: StepSnapshot["step"]
): string {
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

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isNoisyText(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 120) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (!/[a-zA-Z]/.test(text)) return true;
  return false;
}

function textRolePriority(role: string): number {
  switch (role) {
    case "heading":
      return 0;
    case "status":
      return 1;
    case "alert":
      return 2;
    case "link":
      return 3;
    case "tab":
      return 4;
    default:
      return 5;
  }
}

function visibleRolePriority(role: string): number {
  switch (role) {
    case "navigation":
      return 0;
    case "banner":
      return 1;
    case "main":
      return 2;
    case "contentinfo":
      return 3;
    case "dialog":
      return 4;
    case "status":
      return 5;
    case "alert":
      return 6;
    default:
      return 7;
  }
}
