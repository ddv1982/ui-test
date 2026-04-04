import { describe, expect, it } from "vitest";
import {
  buildStateChangeCandidates,
  buildTitleCandidates,
  buildUrlCandidates,
} from "./assertion-candidates-snapshot-candidate-builder.js";
import type { SnapshotNode } from "./assertion-candidates-snapshot-shared.js";

function node(partial: Partial<SnapshotNode> & Pick<SnapshotNode, "role" | "rawLine">): SnapshotNode {
  return {
    visible: true,
    enabled: true,
    ...partial,
  };
}

describe("assertion-candidates-snapshot-candidate-builder", () => {
  it("builds URL and title candidates only for navigation-like actions", () => {
    expect(
      buildUrlCandidates(1, "click", "https://a.test", "https://b.test", "snapshot_native")
    ).toHaveLength(1);
    expect(
      buildTitleCandidates(1, "navigate", "Home", "Dashboard", "snapshot_native")
    ).toHaveLength(1);
    expect(buildUrlCandidates(1, "fill", "https://a.test", "https://b.test", "snapshot_native")).toHaveLength(0);
    expect(buildTitleCandidates(1, "fill", "Home", "Dashboard", "snapshot_native")).toHaveLength(0);
  });

  it("builds enabled-state assertion candidates from qualifying state changes", () => {
    const pre = [
      node({ role: "button", ref: "e1", name: "Submit", enabled: false, rawLine: "button" }),
    ];
    const post = [
      node({ role: "button", ref: "e1", name: "Submit", enabled: true, rawLine: "button" }),
    ];

    const out = buildStateChangeCandidates(
      0,
      "click",
      pre,
      post,
      "",
      undefined,
      "snapshot_native"
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate).toMatchObject({
      action: "assertEnabled",
      enabled: true,
    });
  });
});
