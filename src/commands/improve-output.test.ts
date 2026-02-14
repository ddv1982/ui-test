import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "../core/improve/report-schema.js";
import {
  buildExternalCliInvocationWarning,
  collectAssertionSkipDetails,
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "./improve-output.js";

function buildCandidate(partial: Partial<AssertionCandidate>): AssertionCandidate {
  return {
    index: 0,
    afterAction: "click",
    candidate: {
      action: "assertVisible",
      target: { value: "#status", kind: "css", source: "manual" },
    },
    confidence: 0.9,
    rationale: "candidate",
    ...partial,
  };
}

describe("improve output helpers", () => {
  it("formats assertion apply status counts in stable order", () => {
    const out = formatAssertionApplyStatusCounts([
      buildCandidate({ applyStatus: "skipped_runtime_failure" }),
      buildCandidate({ applyStatus: "applied" }),
      buildCandidate({ applyStatus: "skipped_policy" }),
      buildCandidate({ applyStatus: "skipped_policy" }),
    ]);

    expect(out).toBe("applied=1, skipped_policy=2, skipped_runtime_failure=1");
  });

  it("formats assertion source counts in stable order", () => {
    const out = formatAssertionSourceCounts([
      buildCandidate({ candidateSource: "snapshot_cli" }),
      buildCandidate({ candidateSource: "deterministic" }),
      buildCandidate({ candidateSource: "snapshot_native" }),
      buildCandidate({ candidateSource: "snapshot_native" }),
    ]);

    expect(out).toBe("deterministic=1, snapshot_native=2, snapshot_cli=1");
  });

  it("collects concise skipped assertion details and remaining count", () => {
    const out = collectAssertionSkipDetails(
      [
        buildCandidate({ applyStatus: "applied" }),
        buildCandidate({
          index: 4,
          applyStatus: "skipped_policy",
          applyMessage: "Skipped by policy: snapshot-derived assertVisible candidates are report-only.",
        }),
        buildCandidate({
          index: 8,
          applyStatus: "skipped_runtime_failure",
          applyMessage: "locator.waitFor: Timeout 3000ms exceeded.\nCall log: waiting for #foo",
        }),
        buildCandidate({
          index: 9,
          applyStatus: "skipped_existing",
          applyMessage: "Equivalent assertion already exists.",
        }),
      ],
      2
    );

    expect(out.details).toHaveLength(2);
    expect(out.details[0]).toContain("candidate 2 (step 5) skipped_policy");
    expect(out.details[1]).toContain("candidate 3 (step 9) skipped_runtime_failure");
    expect(out.remaining).toBe(1);
  });

  it("emits warning when invoked binary is outside workspace", () => {
    const cwd = "/repo/project";
    const argv1 = "/Users/dev/.npm/_npx/abcd/node_modules/.bin/ui-test";
    const testFile = "e2e/login.yaml";
    const out = buildExternalCliInvocationWarning(cwd, argv1, testFile);

    expect(out).toContain("outside this workspace");
    expect(out).toContain("node " + path.join(cwd, "dist", "bin", "ui-test.js"));
    expect(out).toContain(path.resolve(cwd, testFile));
  });

  it("does not warn when invoked binary is inside workspace", () => {
    const cwd = "/repo/project";
    const argv1 = "/repo/project/dist/bin/ui-test.js";
    const out = buildExternalCliInvocationWarning(cwd, argv1, "e2e/login.yaml");

    expect(out).toBeUndefined();
  });

  it("warns when invocation path is a bare command token", () => {
    const cwd = "/repo/project";
    const argv1 = "ui-test";
    const out = buildExternalCliInvocationWarning(cwd, argv1, "e2e/login.yaml");

    expect(out).toContain("Could not verify ui-test binary path");
    expect(out).toContain("node " + path.join(cwd, "dist", "bin", "ui-test.js"));
  });

  it("supports file URL invocation paths", () => {
    const cwd = "/repo/project";
    const argv1 = "file:///repo/project/dist/bin/ui-test.js";
    const out = buildExternalCliInvocationWarning(cwd, argv1, "e2e/login.yaml");

    expect(out).toBeUndefined();
  });
});
