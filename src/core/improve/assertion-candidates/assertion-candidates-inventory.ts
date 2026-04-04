import {
  parseSnapshotNodes,
  type StepSnapshot,
} from "./assertion-candidates-snapshot.js";
import type { AssertionCandidate } from "../report-schema.js";
import {
  buildRoleTarget,
  buildTextTarget,
  extractActedTargetHint,
  isNoisyText,
  matchesActedTarget,
  normalizeForCompare,
} from "./assertion-candidates-snapshot-shared.js";
import {
  buildExcludedTargetKeys,
  candidatesForStep,
  INVENTORY_TEXT_CONFIDENCE,
  INVENTORY_TEXT_ROLES,
  INVENTORY_VISIBLE_CONFIDENCE,
  INVENTORY_VISIBLE_ROLES,
  MAX_INVENTORY_CANDIDATES_PER_STEP,
  textRolePriority,
  visibleRolePriority,
} from "./assertion-candidates-inventory-support.js";

type SnapshotInventoryNode = ReturnType<typeof parseSnapshotNodes>[number];

export function buildSnapshotInventoryAssertionCandidates(
  snapshots: StepSnapshot[]
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.scope === "body") continue;
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    if (postNodes.length === 0) continue;

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action === "navigate" ||
      snapshot.step.action === "assertUrl" ||
      snapshot.step.action === "assertTitle" ||
      !("target" in snapshot.step) ||
      !snapshot.step.target
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
      buildExcludedTargetKeys(textCandidates, normalizeForCompare)
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
        "Coverage fallback (inventory): scoped post-step aria snapshot yielded high-signal text.",
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
        "Coverage fallback (inventory): scoped post-step aria snapshot found stable landmark visibility.",
      candidateSource: "snapshot_native",
      coverageFallback: true,
    });
  }
  return out;
}
