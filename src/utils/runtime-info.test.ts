import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyInvocationPath,
  collectRuntimeInfo,
  getCliVersion,
  isPathInside,
  resolveLocalUiTestPackageRoot,
  resolveWorkspaceRoot,
  resolveInvocationPath,
} from "./runtime-info.js";

describe("runtime-info", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      })
    );
    tempDirs.length = 0;
  });

  it("loads CLI version from package.json with fallback-safe behavior", () => {
    const version = getCliVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("resolves invocation paths for absolute, relative, and file URLs", () => {
    const cwd = "/repo/project";
    expect(resolveInvocationPath("/repo/project/dist/bin/ui-test.js", cwd)).toBe(
      path.resolve("/repo/project/dist/bin/ui-test.js")
    );
    expect(resolveInvocationPath("dist/bin/ui-test.js", cwd)).toBe(
      path.resolve(cwd, "dist/bin/ui-test.js")
    );
    expect(resolveInvocationPath("file:///repo/project/dist/bin/ui-test.js", cwd)).toBe(
      path.resolve("/repo/project/dist/bin/ui-test.js")
    );
  });

  it("returns undefined for unverifiable bare command invocation", () => {
    expect(resolveInvocationPath("ui-test", "/repo/project")).toBeUndefined();
  });

  it("classifies invocation paths relative to workspace", () => {
    const inside = classifyInvocationPath("/repo/project", "/repo/project/dist/bin/ui-test.js");
    expect(inside.classification).toBe("inside-workspace");

    const outside = classifyInvocationPath("/repo/project", "/tmp/_npx/bin/ui-test");
    expect(outside.classification).toBe("outside-workspace");

    const unverifiable = classifyInvocationPath("/repo/project", "ui-test");
    expect(unverifiable.classification).toBe("unverifiable");
  });

  it("detects path containment correctly", () => {
    expect(isPathInside("/repo/project/dist/bin/ui-test.js", "/repo/project")).toBe(true);
    expect(isPathInside("/repo/other/ui-test.js", "/repo/project")).toBe(false);
  });

  it("resolves workspace root to nearest package.json directory", () => {
    const root = resolveWorkspaceRoot(path.join(process.cwd(), "src"));
    expect(root).toBe(process.cwd());
  });

  it("collects runtime info with expected shape", () => {
    const info = collectRuntimeInfo(
      "/repo/project",
      "/repo/project/dist/bin/ui-test.js",
      "v22.0.0"
    );
    expect(info.cwd).toBe(path.resolve("/repo/project"));
    expect(info.workspaceRoot).toBe(path.resolve("/repo/project"));
    expect(info.nodeVersion).toBe("v22.0.0");
    expect(info.invocation.classification).toBe("inside-workspace");
    expect(info.cliVersion.length).toBeGreaterThan(0);
  });

  it("classifies local invocation as inside workspace from subdirectories", () => {
    const workspaceRoot = process.cwd();
    const subdir = path.join(workspaceRoot, "src");
    const invocationPath = path.join(workspaceRoot, "dist", "bin", "ui-test.js");
    const info = collectRuntimeInfo(subdir, invocationPath, "v22.0.0");

    expect(info.workspaceRoot).toBe(workspaceRoot);
    expect(info.invocation.classification).toBe("inside-workspace");
  });

  it("prefers nearest ui-test package root over non-ui-test nested package in monorepo-like layouts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-runtime-info-"));
    tempDirs.push(root);
    const appDir = path.join(root, "packages", "app");
    const invocationPath = path.join(root, "dist", "bin", "ui-test.js");
    await fs.mkdir(path.join(root, "dist", "bin"), { recursive: true });
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(invocationPath, "", "utf-8");
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
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "app", version: "1.0.0" }),
      "utf-8"
    );

    const info = collectRuntimeInfo(appDir, invocationPath, "v22.0.0");
    expect(info.workspaceRoot).toBe(root);
    expect(resolveLocalUiTestPackageRoot(appDir)).toBe(root);
    expect(info.localPackageRoot).toBe(root);
    expect(info.invocation.classification).toBe("inside-workspace");
    expect(info.localPackageVersion).toBe("0.1.0");
  });

  it("does not report a local package version when no local ui-test package exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-runtime-info-no-local-"));
    tempDirs.push(root);
    const appDir = path.join(root, "packages", "app");
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "workspace-root", version: "1.2.3" }),
      "utf-8"
    );

    const info = collectRuntimeInfo(appDir, "/tmp/_npx/bin/ui-test", "v22.0.0");
    expect(info.workspaceRoot).toBe(root);
    expect(resolveLocalUiTestPackageRoot(appDir)).toBeUndefined();
    expect(info.localPackageRoot).toBeUndefined();
    expect(info.localPackageVersion).toBeUndefined();
  });
});
