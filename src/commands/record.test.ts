import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerRecord } from "./record.js";

describe("record command options", () => {
  it("registers v2 reliability flags", () => {
    const program = new Command();
    registerRecord(program);
    const command = program.commands.find((entry) => entry.name() === "record");
    expect(command).toBeDefined();

    command?.parseOptions([
      "--browser",
      "firefox",
      "--device",
      "iPhone 13",
      "--test-id-attribute",
      "data-qa",
      "--load-storage",
      ".auth/in.json",
      "--save-storage",
      ".auth/out.json",
    ]);

    const opts = command?.opts() as Record<string, string>;
    expect(opts.browser).toBe("firefox");
    expect(opts.device).toBe("iPhone 13");
    expect(opts.testIdAttribute).toBe("data-qa");
    expect(opts.loadStorage).toBe(".auth/in.json");
    expect(opts.saveStorage).toBe(".auth/out.json");
  });

  it("registers --no-improve flag", () => {
    const program = new Command();
    registerRecord(program);
    const command = program.commands.find((entry) => entry.name() === "record");

    command?.parseOptions(["--no-improve"]);
    const opts = command?.opts() as Record<string, unknown>;
    expect(opts.improve).toBe(false);
  });

  it("defaults improve to true when --no-improve is not passed", () => {
    const program = new Command();
    registerRecord(program);
    const command = program.commands.find((entry) => entry.name() === "record");

    command?.parseOptions([]);
    const opts = command?.opts() as Record<string, unknown>;
    expect(opts.improve).toBe(true);
  });
});
