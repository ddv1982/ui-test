import { describe, expect, it } from "vitest";
import {
  buildSnapshotCliAssertionCandidates,
  parseSnapshotNodes,
} from "./assertion-candidates-snapshot-cli.js";

describe("snapshot-cli assertion candidates", () => {
  it("parses snapshot nodes from playwright-cli output", () => {
    const snapshot = `
- generic [ref=e1]:
  - heading "Dashboard" [level=1] [ref=e2]
  - paragraph [ref=e3]: Welcome back
  - link "Open settings" [ref=e4] [cursor=pointer]:
`;

    const nodes = parseSnapshotNodes(snapshot);
    expect(nodes).toHaveLength(4);
    expect(nodes[1]?.role).toBe("heading");
    expect(nodes[1]?.name).toBe("Dashboard");
    expect(nodes[2]?.text).toBe("Welcome back");
    expect(nodes[3]?.ref).toBe("e4");
  });

  it("generates a high-signal text assertion from post-step snapshot delta", () => {
    const out = buildSnapshotCliAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
        preSnapshot: `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n`,
        postSnapshot:
          `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n  - heading "Welcome" [level=1] [ref=e3]\n`,
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[0]?.confidence).toBe(0.82);
    expect(out[0]?.candidateSource).toBe("snapshot_cli");
  });

  it("excludes unchanged nodes when pre and post snapshots match", () => {
    const snapshot = `- generic [ref=e1]:\n  - heading "Dashboard" [level=1] [ref=e2]\n`;
    const out = buildSnapshotCliAssertionCandidates([
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

  it("does not generate same-target click visibility assertions", () => {
    const out = buildSnapshotCliAssertionCandidates([
      {
        index: 2,
        step: {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Log in' })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
        preSnapshot: `- generic [ref=e1]:\n  - button "Log in" [ref=e2]\n`,
        postSnapshot: `- generic [ref=e1]:\n  - button "Log in" [ref=e2]\n`,
      },
    ]);

    expect(out).toHaveLength(0);
  });

  it("generates multiple candidates from a rich delta", () => {
    const out = buildSnapshotCliAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: { value: "#login", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - heading "Dashboard" [level=1] [ref=e2]',
          '  - link "Settings" [ref=e3]',
          '  - button "Log out" [ref=e4]',
        ].join("\n") + "\n",
      },
    ]);

    expect(out.length).toBeGreaterThan(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    const actions = out.map((c) => c.candidate.action);
    expect(actions).toContain("assertVisible");
  });

  it("ranks headings before status in text candidates", () => {
    const out = buildSnapshotCliAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#go", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - status "Online" [ref=e2]',
          '  - heading "Welcome" [level=1] [ref=e3]',
        ].join("\n") + "\n",
      },
    ]);

    const textCandidates = out.filter((c) => c.candidate.action === "assertText");
    expect(textCandidates.length).toBe(2);
    expect(textCandidates[0]?.candidate.action).toBe("assertText");
    if (textCandidates[0]?.candidate.action === "assertText") {
      expect(textCandidates[0].candidate.text).toBe("Welcome");
    }
  });

  it("preserves framePath from triggering step target", () => {
    const out = buildSnapshotCliAssertionCandidates([
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
        preSnapshot: `- generic [ref=e1]:\n`,
        postSnapshot: `- generic [ref=e1]:\n  - heading "Done" [level=1] [ref=e3]\n`,
      },
    ]);

    expect(out).toHaveLength(1);
    expect("framePath" in out[0]!.candidate.target).toBe(true);
    expect(out[0]?.candidate.target.framePath).toEqual(["iframe[name=\"app-frame\"]"]);
  });
});
