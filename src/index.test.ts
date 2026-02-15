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
});
