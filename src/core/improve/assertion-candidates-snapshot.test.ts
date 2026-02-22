import { describe, expect, it } from "vitest";
import {
  buildSnapshotAssertionCandidates,
  parseSnapshotNodes,
} from "./assertion-candidates-snapshot.js";
import { richDeltaStepSnapshot } from "./assertion-candidates-snapshot.test-fixtures.js";

describe("snapshot assertion candidates", () => {
  it("parses snapshot nodes from aria snapshot output", () => {
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
    const out = buildSnapshotAssertionCandidates([
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
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[0]?.confidence).toBe(0.82);
    expect(out[0]?.candidateSource).toBe("snapshot_native");
  });

  it("generates stable structural candidate when pre and post snapshots match for click action", () => {
    const snapshot = `- generic [ref=e1]:\n  - navigation "Main menu" [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertVisible");
    expect(out[0]?.confidence).toBe(0.84);
    expect(out[0]?.stableStructural).toBe(true);
  });

  it("does not treat unchanged heading as stable structural", () => {
    const snapshot = `- generic [ref=e1]:\n  - heading "Dashboard" [level=1] [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("excludes unchanged nodes for fill actions without delta", () => {
    const snapshot = `- generic [ref=e1]:\n  - heading "Dashboard" [level=1] [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "fill",
          target: { value: "#name", kind: "css", source: "manual" },
          text: "Alice",
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("does not generate same-target click visibility assertions", () => {
    const out = buildSnapshotAssertionCandidates([
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
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("suppresses snapshot text assertions for navigation-like dynamic clicks", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: {
            value:
              "getByRole('link', { name: 'Nederlaag voor Trump: hooggerechtshof VS oordeelt dat heffingen onwettig zijn', exact: true })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
        preSnapshot: `- generic [ref=e1]:\n  - link "Nieuws" [ref=e2]\n`,
        postSnapshot: `- generic [ref=e1]:\n  - heading "Ajax komt goed weg" [level=1] [ref=e3]\n`,
        preUrl: "https://www.nu.nl/",
        postUrl: "https://www.nu.nl/algemeen",
      },
    ], "snapshot_native");

    expect(out.some((candidate) => candidate.candidate.action === "assertText")).toBe(false);
    expect(out.some((candidate) => candidate.candidate.action === "assertVisible")).toBe(false);
    expect(out.some((candidate) => candidate.candidate.action === "assertEnabled")).toBe(false);
    expect(out.some((candidate) => candidate.candidate.action === "assertUrl")).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("generates multiple candidates from a rich delta", () => {
    const out = buildSnapshotAssertionCandidates([richDeltaStepSnapshot], "snapshot_native");

    expect(out.length).toBeGreaterThan(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    const actions = out.map((c) => c.candidate.action);
    expect(actions).toContain("assertVisible");
  });

  it("ranks headings before status in text candidates", () => {
    const out = buildSnapshotAssertionCandidates([
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
    ], "snapshot_native");

    const textCandidates = out.filter((c) => c.candidate.action === "assertText");
    expect(textCandidates.length).toBe(2);
    expect(textCandidates[0]?.candidate.action).toBe("assertText");
    if (textCandidates[0]?.candidate.action === "assertText") {
      expect(textCandidates[0].candidate.text).toBe("Welcome");
    }
  });

  it("prioritizes navigation over heading in stable structural candidates", () => {
    const snapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
      '  - heading "Nieuws" [level=1] [ref=e3]',
    ].join("\n") + "\n";

    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    const stableCandidates = out.filter((c) => c.stableStructural === true);
    expect(stableCandidates).toHaveLength(1);
    const step = stableCandidates[0]?.candidate;
    expect(step?.action).not.toBe("navigate");
    if (step && "target" in step && step.target) {
      expect(step.target.value).toContain("navigation");
    }
  });

  it("generates stable candidate alongside delta candidates for click actions", () => {
    const preSnapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
    ].join("\n") + "\n";
    const postSnapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
      '  - heading "Welcome" [level=1] [ref=e3]',
    ].join("\n") + "\n";

    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#go", kind: "css", source: "manual" },
        },
        preSnapshot,
        postSnapshot,
      },
    ], "snapshot_native");

    const stableCandidates = out.filter((c) => c.stableStructural === true);
    const deltaCandidates = out.filter((c) => !c.stableStructural);
    expect(stableCandidates).toHaveLength(1);
    expect(deltaCandidates.length).toBeGreaterThan(0);
  });

  it("preserves framePath from triggering step target", () => {
    const out = buildSnapshotAssertionCandidates([
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
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    const firstCandidate = out[0]?.candidate;
    expect(firstCandidate && "target" in firstCandidate).toBe(true);
    if (firstCandidate && "target" in firstCandidate && firstCandidate.target) {
      expect("framePath" in firstCandidate.target).toBe(true);
      expect(firstCandidate.target.framePath).toEqual(["iframe[name=\"app-frame\"]"]);
    }
  });

  it("applies text-change cap after filtering so later qualifying changes are retained", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#refresh", kind: "css", source: "manual" },
        },
        preSnapshot: [
          "- generic [ref=e0]:",
          '  - button "Save" [ref=e1]: Idle',
          '  - button "Cancel" [ref=e2]: Idle',
          '  - status "Sync" [ref=e3]: Waiting',
        ].join("\n") + "\n",
        postSnapshot: [
          "- generic [ref=e0]:",
          '  - button "Save" [ref=e1]: Done',
          '  - button "Cancel" [ref=e2]: Done',
          '  - status "Sync" [ref=e3]: Complete',
        ].join("\n") + "\n",
      },
    ], "snapshot_native");

    const strongTextCandidate = out.find(
      (candidate) =>
        candidate.candidate.action === "assertText" &&
        candidate.confidence === 0.85 &&
        candidate.candidate.text === "Complete"
    );
    expect(strongTextCandidate).toBeDefined();
  });

  it("applies state-change cap after filtering so later qualifying changes are retained", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#refresh", kind: "css", source: "manual" },
        },
        preSnapshot: [
          "- generic [ref=e0]:",
          '  - navigation "Global nav" [disabled] [ref=e1]',
          '  - button "1234" [disabled] [ref=e2]',
          '  - button "Submit order" [disabled] [ref=e3]',
        ].join("\n") + "\n",
        postSnapshot: [
          "- generic [ref=e0]:",
          '  - navigation "Global nav" [ref=e1]',
          '  - button "1234" [ref=e2]',
          '  - button "Submit order" [ref=e3]',
        ].join("\n") + "\n",
      },
    ], "snapshot_native");

    const enabledCandidate = out.find(
      (candidate) =>
        candidate.candidate.action === "assertEnabled" &&
        candidate.candidate.enabled === true &&
        "target" in candidate.candidate &&
        candidate.candidate.target.value.includes("Submit order")
    );
    expect(enabledCandidate).toBeDefined();
  });

  it("uses snapshot refs to avoid false-positive text changes for repeated role/name nodes", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#sync", kind: "css", source: "manual" },
        },
        preSnapshot: [
          "- generic [ref=e0]:",
          '  - status "Sync state" [ref=e1]: Ready',
          '  - status "Sync state" [ref=e2]: Pending',
        ].join("\n") + "\n",
        postSnapshot: [
          "- generic [ref=e0]:",
          '  - status "Sync state" [ref=e1]: Ready',
          '  - status "Sync state" [ref=e2]: Complete',
        ].join("\n") + "\n",
      },
    ], "snapshot_native");

    const changedTextCandidates = out.filter(
      (candidate) =>
        candidate.candidate.action === "assertText" &&
        candidate.confidence === 0.85
    );
    expect(changedTextCandidates).toHaveLength(1);
    const step = changedTextCandidates[0]?.candidate;
    if (step && step.action === "assertText") {
      expect(step.text).toBe("Complete");
    }
  });
});
