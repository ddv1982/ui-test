import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const { collectRuntimeInfoMock } = vi.hoisted(() => ({
  collectRuntimeInfoMock: vi.fn(),
}));

vi.mock("../utils/runtime-info.js", () => ({
  collectRuntimeInfo: collectRuntimeInfoMock,
}));

import { registerDoctor, runDoctor } from "./doctor.js";

describe("doctor command", () => {
  beforeEach(() => {
    collectRuntimeInfoMock.mockReset();
  });

  it("registers doctor command", () => {
    const program = new Command();
    registerDoctor(program);
    const command = program.commands.find((entry) => entry.name() === "doctor");
    expect(command).toBeDefined();
  });

  it("prints runtime sections for inside-workspace invocation", async () => {
    collectRuntimeInfoMock.mockReturnValue({
      cliVersion: "0.1.0",
      nodeVersion: "v22.0.0",
      cwd: "/repo/project",
      workspaceRoot: "/repo/project",
      localPackageRoot: "/repo/project",
      invocation: {
        rawInvocation: "/repo/project/dist/bin/ui-test.js",
        resolvedInvocationPath: "/repo/project/dist/bin/ui-test.js",
        classification: "inside-workspace",
      },
      localPackageVersion: "0.1.0",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runDoctor()).resolves.toBeUndefined();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("CLI version: 0.1.0");
    expect(output).toContain("Node version: v22.0.0");
    expect(output).toContain("Working directory: /repo/project");
    expect(output).toContain("Workspace root: /repo/project");
    expect(output).toContain("Invocation classification: inside-workspace");
    expect(output).toContain("Local ui-test package version (workspace): 0.1.0");
    logSpy.mockRestore();
  });

  it("warns for outside-workspace invocation and version mismatch", async () => {
    collectRuntimeInfoMock.mockReturnValue({
      cliVersion: "0.1.0",
      nodeVersion: "v22.0.0",
      cwd: "/repo/project",
      workspaceRoot: "/repo/project",
      localPackageRoot: "/repo/project",
      invocation: {
        rawInvocation: "/tmp/_npx/bin/ui-test",
        resolvedInvocationPath: "/tmp/_npx/bin/ui-test",
        classification: "outside-workspace",
      },
      localPackageVersion: "0.1.1",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runDoctor()).resolves.toBeUndefined();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("outside current workspace");
    expect(output).toContain("Version mismatch detected");
    expect(output).toContain("Use local build explicitly");
    expect(output).toContain("node /repo/project/dist/bin/ui-test.js doctor");
    logSpy.mockRestore();
  });

  it("warns for unverifiable invocation path", async () => {
    collectRuntimeInfoMock.mockReturnValue({
      cliVersion: "0.1.0",
      nodeVersion: "v22.0.0",
      cwd: "/repo/project",
      workspaceRoot: "/repo/project",
      localPackageRoot: "/repo/project",
      invocation: {
        rawInvocation: "ui-test",
        classification: "unverifiable",
      },
      localPackageVersion: "0.1.0",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runDoctor()).resolves.toBeUndefined();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Could not verify binary path from invocation");
    expect(output).toContain("node /repo/project/dist/bin/ui-test.js doctor");
    logSpy.mockRestore();
  });

  it("does not emit version mismatch warning when no local ui-test package is detected", async () => {
    collectRuntimeInfoMock.mockReturnValue({
      cliVersion: "0.1.0",
      nodeVersion: "v22.0.0",
      cwd: "/repo/project/packages/app",
      workspaceRoot: "/repo/project",
      invocation: {
        rawInvocation: "/tmp/_npx/bin/ui-test",
        resolvedInvocationPath: "/tmp/_npx/bin/ui-test",
        classification: "outside-workspace",
      },
      localPackageVersion: undefined,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runDoctor()).resolves.toBeUndefined();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Local ui-test package version (workspace): (not found)");
    expect(output).not.toContain("Version mismatch detected");
    expect(output).toContain("npx ui-test doctor");
    logSpy.mockRestore();
  });
});
