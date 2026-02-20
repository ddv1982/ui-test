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
      "--assertions",
      "none",
      "--assertion-source",
      "snapshot-native",
      "--assertion-policy",
      "balanced",
      "--report",
      "report.json",
      "e2e/sample.yaml",
    ]);

    const opts = command?.opts() as Record<string, string | boolean>;
    expect(opts.apply).toBe(true);
    expect(opts.assertions).toBe("none");
    expect(opts.assertionSource).toBe("snapshot-native");
    expect(opts.assertionPolicy).toBe("balanced");
    expect(opts.report).toBe("report.json");
  });

  it("--no-apply sets apply to false", () => {
    const program = new Command();
    registerImprove(program);
    const command = program.commands.find((entry) => entry.name() === "improve");
    expect(command).toBeDefined();

    command?.parseOptions(["--no-apply", "e2e/sample.yaml"]);
    const opts = command?.opts() as Record<string, string | boolean | undefined>;
    expect(opts.apply).toBe(false);
  });

  it("defaults apply to undefined when not specified", () => {
    const program = new Command();
    registerImprove(program);
    const command = program.commands.find((entry) => entry.name() === "improve");
    expect(command).toBeDefined();

    command?.parseOptions(["e2e/sample.yaml"]);
    const opts = command?.opts() as Record<string, string | boolean | undefined>;
    expect(opts.apply).toBeUndefined();
  });
});
