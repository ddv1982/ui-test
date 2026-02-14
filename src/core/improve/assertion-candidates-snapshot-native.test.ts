import { describe, expect, it } from "vitest";
import { buildSnapshotNativeAssertionCandidates } from "./assertion-candidates-snapshot-native.js";
import { richDeltaStepSnapshot } from "./assertion-candidates-snapshot.test-fixtures.js";

describe("snapshot-native assertion candidates", () => {
  it("generates a text assertion from post-step snapshot delta", () => {
    const out = buildSnapshotNativeAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n  - button \"Submit\" [ref=e2]\n",
        postSnapshot:
          "- generic [ref=e1]:\n  - button \"Submit\" [ref=e2]\n  - heading \"Welcome\" [level=1] [ref=e3]\n",
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[0]?.confidence).toBe(0.82);
    expect(out[0]?.candidateSource).toBe("snapshot_native");
  });

  it("generates a visible assertion for non-text roles", () => {
    const out = buildSnapshotNativeAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#login", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: "- generic [ref=e1]:\n  - button \"Log out\" [ref=e2]\n",
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertVisible");
    expect(out[0]?.candidateSource).toBe("snapshot_native");
  });

  it("returns empty when pre and post snapshots match", () => {
    const snapshot = "- generic [ref=e1]:\n  - heading \"Dashboard\" [level=1] [ref=e2]\n";
    const out = buildSnapshotNativeAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ]);

    expect(out).toHaveLength(0);
  });

  it("generates multiple candidates from a rich delta via native snapshots", () => {
    const out = buildSnapshotNativeAssertionCandidates([richDeltaStepSnapshot]);

    expect(out.length).toBeGreaterThan(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[0]?.candidateSource).toBe("snapshot_native");
    const actions = out.map((c) => c.candidate.action);
    expect(actions).toContain("assertVisible");
  });

  it("preserves framePath from triggering step target", () => {
    const out = buildSnapshotNativeAssertionCandidates([
      {
        index: 3,
        step: {
          action: "click",
          target: {
            value: "#open",
            kind: "css",
            source: "manual",
            framePath: ["iframe[name=\"app-frame\"]"],
          },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: "- generic [ref=e1]:\n  - heading \"Done\" [level=1] [ref=e3]\n",
      },
    ]);

    expect(out).toHaveLength(1);
    const step = out[0]!.candidate;
    expect(step.action).not.toBe("navigate");
    if (step.action !== "navigate") {
      expect(step.target.framePath).toEqual(["iframe[name=\"app-frame\"]"]);
    }
  });
});
