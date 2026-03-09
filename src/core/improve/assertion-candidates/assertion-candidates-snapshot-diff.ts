import {
  nodeIdentityKey,
  nodeSignature,
  type SnapshotNode,
} from "./assertion-candidates-snapshot-shared.js";

export interface TextChange {
  node: SnapshotNode;
  oldText: string;
  newText: string;
}

export interface StateChange {
  node: SnapshotNode;
  type: "enabled" | "disabled" | "expanded" | "collapsed";
}

export function buildDeltaNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => !preKeys.has(nodeSignature(node)));
}

export function buildStableNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => preKeys.has(nodeSignature(node)));
}

export function detectTextChanges(preNodes: SnapshotNode[], postNodes: SnapshotNode[]): TextChange[] {
  const changes: TextChange[] = [];
  const preByKey = new Map<string, SnapshotNode>();

  for (const node of preNodes) {
    const key = nodeIdentityKey(node);
    preByKey.set(key, node);
  }

  for (const postNode of postNodes) {
    const key = nodeIdentityKey(postNode);
    const preNode = preByKey.get(key);
    if (!preNode) continue;

    const preText = (preNode.text ?? preNode.name ?? "").trim();
    const postText = (postNode.text ?? postNode.name ?? "").trim();

    if (preText !== postText && preText && postText) {
      changes.push({
        node: postNode,
        oldText: preText,
        newText: postText,
      });
    }
  }

  return changes;
}

export function detectStateChanges(preNodes: SnapshotNode[], postNodes: SnapshotNode[]): StateChange[] {
  const changes: StateChange[] = [];
  const preByKey = new Map<string, SnapshotNode>();

  for (const node of preNodes) {
    const key = nodeIdentityKey(node);
    preByKey.set(key, node);
  }

  for (const postNode of postNodes) {
    const key = nodeIdentityKey(postNode);
    const preNode = preByKey.get(key);
    if (!preNode) continue;

    if (preNode.enabled !== postNode.enabled) {
      changes.push({
        node: postNode,
        type: postNode.enabled ? "enabled" : "disabled",
      });
    }

    if (preNode.expanded !== postNode.expanded && postNode.expanded !== undefined) {
      changes.push({
        node: postNode,
        type: postNode.expanded ? "expanded" : "collapsed",
      });
    }
  }

  return changes;
}
