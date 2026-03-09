import type { SnapshotNode } from "./assertion-candidates-snapshot-shared.js";

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
    if (!role) continue;
    const refMatch = /\[ref=([^\]]+)\]/.exec(content);
    const nameMatch = /"([^"]+)"/.exec(content);
    const textMatch = /: (.+)$/.exec(content);

    const name = nameMatch?.[1]?.trim();
    const text = textMatch?.[1]?.trim();

    const hiddenMatch = /\[hidden\]/.test(content);
    const disabledMatch = /\[disabled\]/.test(content);
    const expandedMatch = /\[expanded=(true|false)\]/.exec(content);

    const node: SnapshotNode = {
      role,
      visible: !hiddenMatch,
      enabled: !disabledMatch,
      rawLine: trimmed,
    };

    if (name) node.name = name;
    if (text) node.text = text;

    const ref = refMatch?.[1];
    if (ref) node.ref = ref;

    const expandedValue = expandedMatch?.[1];
    if (expandedValue !== undefined) {
      node.expanded = expandedValue === "true";
    }

    nodes.push(node);
  }

  return nodes;
}
