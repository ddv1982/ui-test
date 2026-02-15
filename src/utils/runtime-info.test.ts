import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyInvocationPath,
  collectRuntimeInfo,
  GITHUB_ONE_OFF_PREFIX,
  getCliVersion,
  isLikelyNpxCacheInvocation,
  isPathInside,
  isProjectLocalUiTestInvocation,
  resolveCommandPrefix,
  resolveLocalUiTestPackageRoot,
  resolveInvocationPath,
  resolveWorkspaceRoot,
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

  it("detects invocation from project-local node_modules/ui-test", () => {
    const cwd = "/repo/project";
    const invocation = "/repo/project/node_modules/ui-test/dist/bin/ui-test.js";
    expect(isProjectLocalUiTestInvocation(cwd, invocation)).toBe(true);
  });

  it("does not classify global installation path as project-local", () => {
    const cwd = "/repo/project";
    const invocation = "/usr/local/lib/node_modules/ui-test/dist/bin/ui-test.js";
    expect(isProjectLocalUiTestInvocation(cwd, invocation)).toBe(false);
  });

  it("does not classify npx cache path as project-local", () => {
    const cwd = "/repo/project";
    const invocation = "/tmp/_npx/abcd/node_modules/ui-test/dist/bin/ui-test.js";
    expect(isProjectLocalUiTestInvocation(cwd, invocation)).toBe(false);
  });

  it("detects likely npx cache invocations", () => {
    expect(isLikelyNpxCacheInvocation("/tmp/_npx/abcd/node_modules/ui-test/dist/bin/ui-test.js"))
      .toBe(true);
    expect(isLikelyNpxCacheInvocation("/usr/local/lib/node_modules/ui-test/dist/bin/ui-test.js"))
      .toBe(false);
  });

  it("resolves command prefix based on invocation context", () => {
    expect(resolveCommandPrefix("/usr/local/lib/node_modules/ui-test/dist/bin/ui-test.js"))
      .toBe("ui-test");
  });

  it("uses GitHub one-off prefix only when npx cache dependency spec points at repo", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-runtime-prefix-github-"));
    tempDirs.push(root);
    const cacheRoot = path.join(root, "_npx", "abcd1234");
    const invocation = path.join(cacheRoot, "node_modules", "ui-test", "dist", "bin", "ui-test.js");
    await fs.mkdir(path.dirname(invocation), { recursive: true });
    await fs.writeFile(invocation, "", "utf-8");
    await fs.writeFile(
      path.join(cacheRoot, "package-lock.json"),
      JSON.stringify({
        packages: {
          "": {
            dependencies: {
              "ui-test": "github:ddv1982/easy-e2e-testing",
            },
          },
        },
      }),
      "utf-8"
    );

    expect(resolveCommandPrefix(invocation)).toBe(GITHUB_ONE_OFF_PREFIX);
  });

  it("does not force GitHub one-off prefix for generic npx cache paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-runtime-prefix-generic-"));
    tempDirs.push(root);
    const cacheRoot = path.join(root, "_npx", "efgh5678");
    const invocation = path.join(cacheRoot, "node_modules", "ui-test", "dist", "bin", "ui-test.js");
    await fs.mkdir(path.dirname(invocation), { recursive: true });
    await fs.writeFile(invocation, "", "utf-8");
    await fs.writeFile(
      path.join(cacheRoot, "package-lock.json"),
      JSON.stringify({
        packages: {
          "": {
            dependencies: {
              "ui-test": "^0.1.0",
            },
          },
        },
      }),
      "utf-8"
    );

    expect(resolveCommandPrefix(invocation)).toBe("ui-test");
  });
});
