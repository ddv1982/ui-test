import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerImprove } from "./improve.js";

describe("improve command options", () => {
  it("registers improve flags", () => {
    const program = new Command();
    registerImprove(program);
    const command = program.commands.find((entry) => entry.name() === "improve");
    expect(command).toBeDefined();

    command?.parseOptions([
      "--apply",
      "--apply-assertions",
      "--llm",
      "--provider",
      "playwright-cli",
      "--assertions",
      "none",
      "--report",
      "report.json",
      "e2e/sample.yaml",
    ]);

    const opts = command?.opts() as Record<string, string | boolean>;
    expect(opts.apply).toBe(true);
    expect(opts.applyAssertions).toBe(true);
    expect(opts.llm).toBe(true);
    expect(opts.provider).toBe("playwright-cli");
    expect(opts.assertions).toBe("none");
    expect(opts.report).toBe("report.json");
  });

  it("supports negative override flags for booleans", () => {
    const program = new Command();
    registerImprove(program);
    const command = program.commands.find((entry) => entry.name() === "improve");
    expect(command).toBeDefined();

    command?.parseOptions(["--no-apply", "--no-apply-assertions", "--no-llm", "e2e/sample.yaml"]);
    const opts = command?.opts() as Record<string, boolean>;
    expect(opts.apply).toBe(false);
    expect(opts.applyAssertions).toBe(false);
    expect(opts.llm).toBe(false);
  });
});
