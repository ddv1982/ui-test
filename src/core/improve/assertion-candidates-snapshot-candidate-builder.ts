import type { Step } from "../yaml-schema.js";
import type {
  AssertionCandidate,
  AssertionCandidateSource,
} from "./report-schema.js";
import {
  buildRoleTarget,
  buildTextTarget,
  isNoisyText,
  matchesActedTarget,
  MAX_STATE_CANDIDATES_PER_STEP,
  STATE_CHANGE_ROLE_ALLOWLIST,
  STABLE_STRUCTURAL_ROLES,
  stableStructuralRolePriority,
  TEXT_ROLE_ALLOWLIST,
  textRolePriority,
  VISIBLE_ROLE_ALLOWLIST,
  visibleRolePriority,
  type SnapshotNode,
} from "./assertion-candidates-snapshot-shared.js";
import {
  detectStateChanges,
  detectTextChanges,
} from "./assertion-candidates-snapshot-diff.js";

export function buildUrlCandidates(
  index: number,
  afterAction: Step["action"],
  preUrl: string | undefined,
  postUrl: string | undefined,
  candidateSource: AssertionCandidateSource | undefined
): AssertionCandidate[] {
  if (!preUrl || !postUrl || preUrl === postUrl) return [];
  if (afterAction !== "click" && afterAction !== "navigate") return [];

  return [{
    index,
    afterAction,
    candidate: {
      action: "assertUrl" as const,
      url: postUrl,
    },
    confidence: 0.88,
    rationale: "URL changed after navigation action.",
    candidateSource: candidateSource ?? "snapshot_native",
  }];
}

export function buildTitleCandidates(
  index: number,
  afterAction: Step["action"],
  preTitle: string | undefined,
  postTitle: string | undefined,
  candidateSource: AssertionCandidateSource | undefined
): AssertionCandidate[] {
  if (!preTitle || !postTitle || preTitle === postTitle) return [];
  if (afterAction !== "click" && afterAction !== "navigate") return [];
  if (isNoisyText(postTitle)) return [];

  return [{
    index,
    afterAction,
    candidate: {
      action: "assertTitle" as const,
      title: postTitle,
    },
    confidence: 0.82,
    rationale: "Page title changed after action.",
    candidateSource: candidateSource ?? "snapshot_native",
  }];
}

export function buildTextChangedCandidates(
  index: number,
  afterAction: Step["action"],
  preNodes: SnapshotNode[],
  postNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxTextCandidatesPerStep: number
): AssertionCandidate[] {
  const changes = detectTextChanges(preNodes, postNodes);
  const qualifying = changes.filter((change) => {
    if (!TEXT_ROLE_ALLOWLIST.has(change.node.role)) return false;
    if (isNoisyText(change.newText)) return false;
    if (matchesActedTarget(change.newText, actedTargetHint)) return false;
    return true;
  });

  return qualifying.slice(0, maxTextCandidatesPerStep).map((change) => ({
    index,
    afterAction,
    candidate: {
      action: "assertText" as const,
      target: buildTextTarget(change.node, change.newText, framePath),
      text: change.newText,
    },
    confidence: 0.85,
    rationale: "Text content changed after action.",
    candidateSource,
  }));
}

export function buildStateChangeCandidates(
  index: number,
  afterAction: Step["action"],
  preNodes: SnapshotNode[],
  postNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const changes = detectStateChanges(preNodes, postNodes);
  const qualifying = changes.filter((change) => {
    if (!STATE_CHANGE_ROLE_ALLOWLIST.has(change.node.role)) return false;
    if (!change.node.name || isNoisyText(change.node.name)) return false;
    if (matchesActedTarget(change.node.name, actedTargetHint)) return false;
    return change.type === "enabled" || change.type === "disabled";
  });

  return qualifying.slice(0, MAX_STATE_CANDIDATES_PER_STEP).map((change) => ({
    index,
    afterAction,
    candidate: {
      action: "assertEnabled" as const,
      target: buildRoleTarget(change.node.role, change.node.name!, framePath),
      enabled: change.type === "enabled",
    },
    confidence: 0.8,
    rationale: `Element became ${change.type} after action.`,
    candidateSource,
  }));
}

export function buildVisibleCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying = nodes.filter((node) => {
    if (!VISIBLE_ROLE_ALLOWLIST.has(node.role)) return false;
    if (!node.name || isNoisyText(node.name)) return false;
    if (matchesActedTarget(node.name, actedTargetHint)) return false;
    return true;
  });

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

export function buildTextCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying = nodes
    .map((node) => ({ node, text: (node.text ?? node.name ?? "").trim() }))
    .filter(({ node, text }) => {
      if (!TEXT_ROLE_ALLOWLIST.has(node.role)) return false;
      if (!text || isNoisyText(text)) return false;
      if (matchesActedTarget(text, actedTargetHint)) return false;
      return true;
    });

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

export function buildStableVisibleCandidates(
  index: number,
  afterAction: Step["action"],
  stableNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const qualifying = stableNodes.filter((node) => {
    if (!STABLE_STRUCTURAL_ROLES.has(node.role)) return false;
    if (!node.name || isNoisyText(node.name)) return false;
    if (matchesActedTarget(node.name, actedTargetHint)) return false;
    return true;
  });

  qualifying.sort(
    (a, b) => stableStructuralRolePriority(a.role) - stableStructuralRolePriority(b.role)
  );

  return qualifying.slice(0, 1).map((node) => ({
    index,
    afterAction,
    candidate: {
      action: "assertVisible" as const,
      target: buildRoleTarget(node.role, node.name!, framePath),
    },
    confidence: 0.84,
    rationale: "Stable structural element present in both pre- and post-snapshots.",
    candidateSource,
    stableStructural: true,
  }));
}
