import { describe, expect, it } from "vitest";
import {
  buildDeltaNodes,
  buildStableNodes,
  detectStateChanges,
  detectTextChanges,
} from "./assertion-candidates-snapshot-diff.js";
import type { SnapshotNode } from "./assertion-candidates-snapshot-shared.js";

function node(partial: Partial<SnapshotNode> & Pick<SnapshotNode, "role" | "rawLine">): SnapshotNode {
  return {
    visible: true,
    enabled: true,
    ...partial,
  };
}

describe("assertion-candidates-snapshot-diff", () => {
  it("builds delta and stable node sets from signatures", () => {
    const pre = [
      node({ role: "heading", name: "Welcome", rawLine: "heading" }),
    ];
    const post = [
      node({ role: "heading", name: "Welcome", rawLine: "heading" }),
      node({ role: "status", name: "Saved", rawLine: "status" }),
    ];

    expect(buildStableNodes(pre, post)).toHaveLength(1);
    expect(buildDeltaNodes(pre, post)).toHaveLength(1);
    expect(buildDeltaNodes(pre, post)[0]?.role).toBe("status");
  });

  it("detects text changes on nodes with the same identity", () => {
    const pre = [
      node({ role: "status", ref: "e1", text: "Saving", rawLine: "status" }),
    ];
    const post = [
      node({ role: "status", ref: "e1", text: "Saved", rawLine: "status" }),
    ];

    expect(detectTextChanges(pre, post)).toEqual([
      expect.objectContaining({
        oldText: "Saving",
        newText: "Saved",
      }),
    ]);
  });

  it("detects enabled/disabled and expanded/collapsed state changes", () => {
    const pre = [
      node({ role: "button", ref: "e1", name: "Submit", enabled: false, rawLine: "button" }),
      node({ role: "tab", ref: "e2", name: "Details", expanded: false, rawLine: "tab" }),
    ];
    const post = [
      node({ role: "button", ref: "e1", name: "Submit", enabled: true, rawLine: "button" }),
      node({ role: "tab", ref: "e2", name: "Details", expanded: true, rawLine: "tab" }),
    ];

    expect(detectStateChanges(pre, post)).toEqual([
      expect.objectContaining({ type: "enabled" }),
      expect.objectContaining({ type: "expanded" }),
    ]);
  });
});
