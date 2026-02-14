import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      })
    );
    tempDirs.length = 0;
  });

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
    expect(out).toContain("npx ui-test improve " + path.resolve(cwd, testFile));
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
    expect(out).toContain("npx ui-test improve " + path.resolve(cwd, "e2e/login.yaml"));
  });

  it("supports file URL invocation paths", () => {
    const cwd = "/repo/project";
    const argv1 = "file:///repo/project/dist/bin/ui-test.js";
    const out = buildExternalCliInvocationWarning(cwd, argv1, "e2e/login.yaml");

    expect(out).toBeUndefined();
  });

  it("does not warn when running from a workspace subdirectory", () => {
    const workspaceRoot = process.cwd();
    const cwd = path.join(workspaceRoot, "src");
    const argv1 = path.join(workspaceRoot, "dist", "bin", "ui-test.js");
    const out = buildExternalCliInvocationWarning(cwd, argv1, "e2e/login.yaml");

    expect(out).toBeUndefined();
  });

  it("resolves warning paths correctly from nested cwd with relative test path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-output-"));
    tempDirs.push(root);
    const subdir = path.join(root, "packages", "app");
    const localEntrypoint = path.join(root, "dist", "bin", "ui-test.js");
    const testFile = "../e2e/login.yaml";
    await fs.mkdir(path.join(root, "dist", "bin"), { recursive: true });
    await fs.mkdir(subdir, { recursive: true });
    await fs.writeFile(localEntrypoint, "", "utf-8");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "ui-test",
        version: "0.1.0",
        bin: { "ui-test": "./dist/bin/ui-test.js" },
      }),
      "utf-8"
    );
    await fs.writeFile(
      path.join(subdir, "package.json"),
      JSON.stringify({ name: "app", version: "1.0.0" }),
      "utf-8"
    );

    const out = buildExternalCliInvocationWarning(subdir, "/tmp/_npx/bin/ui-test", testFile);
    expect(out).toContain(`outside this workspace (${root})`);
    expect(out).toContain(`node ${localEntrypoint} improve ${path.resolve(subdir, testFile)}`);
  });
});
