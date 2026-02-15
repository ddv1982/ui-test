import { describe, expect, it } from "vitest";
import { createProgram } from "./index.js";

describe("CLI command registration", () => {
  it("registers expected commands and excludes init/bootstrap", () => {
    const program = createProgram();
    const commandNames = program.commands.map((command) => command.name()).sort();

    expect(commandNames).toEqual([
      "doctor",
      "example-app",
      "improve",
      "list",
      "play",
      "record",
      "setup",
    ]);
    expect(commandNames).not.toContain("init");
    expect(commandNames).not.toContain("bootstrap");
  });

  it("rejects legacy bootstrap command", async () => {
    const program = createProgram();
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "ui-test", "bootstrap"], { from: "node" })
    ).rejects.toMatchObject({ code: "commander.unknownCommand" });
  });

  it("shows unified help with options from all subcommands", () => {
    const program = createProgram();
    const help = program.helpInformation();

    // play options
    expect(help).toContain("--headed");
    // record options
    expect(help).toContain("--selector-policy");
    // improve options
    expect(help).toContain("--assertions");
    // setup options
    expect(help).toContain("--run-play");
    // All subcommand names present
    expect(help).toContain("play");
    expect(help).toContain("record");
    expect(help).toContain("improve");
    expect(help).toContain("setup");
    expect(help).toContain("doctor");
    expect(help).toContain("list");
  });

  it("uses default Commander help for subcommands", () => {
    const program = createProgram();
    const playCmd = program.commands.find((c) => c.name() === "play")!;
    const help = playCmd.helpInformation();

    // Should use standard Commander layout with "Arguments:" / "Options:" headings
    expect(help).toContain("Options:");
    expect(help).toContain("--headed");
    // Should include -h/--help (default Commander includes it; unified help excludes it)
    expect(help).toContain("-h, --help");
    // Should NOT contain other subcommand options (unified-only behavior)
    expect(help).not.toContain("--selector-policy");
  });
});
