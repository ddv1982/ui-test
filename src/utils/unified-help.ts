import type { Command, Help, Option } from "commander";

function nonHelpOptions(helper: Help, sub: Command): Option[] {
  return helper.visibleOptions(sub).filter(
    (opt) => opt.short !== "-h" && opt.long !== "--help"
  );
}

/**
 * Build a unified help string that shows all subcommands with their options inline.
 * Designed for the root program only — subcommands use Commander's default formatHelp.
 */
export function buildUnifiedHelp(cmd: Command, helper: Help): string {
  const output: string[] = [];

  // Usage
  output.push(helper.styleTitle("Usage:") + " " + helper.styleUsage(helper.commandUsage(cmd)));
  output.push("");

  // Description
  const desc = helper.commandDescription(cmd);
  if (desc) {
    output.push(helper.styleCommandDescription(desc));
    output.push("");
  }

  // Collect all subcommands (excluding implicit "help" command)
  const subcommands = helper.visibleCommands(cmd).filter((sub) => sub.name() !== "help");

  if (subcommands.length > 0) {
    // Pre-compute filtered options per subcommand
    const optionsByCommand = new Map<Command, Option[]>();
    for (const sub of subcommands) {
      optionsByCommand.set(sub, nonHelpOptions(helper, sub));
    }

    // Calculate a global term width across all subcommand option terms for alignment
    let maxOptionTermWidth = 0;
    for (const options of optionsByCommand.values()) {
      for (const opt of options) {
        const termLen = helper.displayWidth(helper.optionTerm(opt));
        if (termLen > maxOptionTermWidth) maxOptionTermWidth = termLen;
      }
    }

    // Also consider subcommand term width for the command header lines
    let maxSubTermWidth = 0;
    for (const sub of subcommands) {
      const termLen = helper.displayWidth(helper.subcommandTerm(sub));
      if (termLen > maxSubTermWidth) maxSubTermWidth = termLen;
    }

    output.push(helper.styleTitle("Commands:"));

    for (const sub of subcommands) {
      // Command header: term + description, using same formatting as default help
      const subTerm = helper.subcommandTerm(sub);
      const subDesc = helper.subcommandDescription(sub);
      output.push(helper.formatItem(subTerm, maxSubTermWidth, subDesc, helper));

      // Inline options
      const options = optionsByCommand.get(sub)!;
      for (const opt of options) {
        const term = helper.optionTerm(opt);
        const optDesc = helper.optionDescription(opt);
        const formatted = helper.formatItem(term, maxOptionTermWidth, optDesc, helper);
        // Indent option lines by 4 extra spaces
        const indented = formatted
          .split("\n")
          .map((line) => "    " + line)
          .join("\n");
        output.push(indented);
      }

      output.push("");
    }
  }

  // Global options (version + help)
  const globalOptions = helper.visibleOptions(cmd);
  if (globalOptions.length > 0) {
    let maxGlobalTermWidth = 0;
    for (const opt of globalOptions) {
      const termLen = helper.displayWidth(helper.optionTerm(opt));
      if (termLen > maxGlobalTermWidth) maxGlobalTermWidth = termLen;
    }

    output.push(helper.styleTitle("Global Options:"));
    for (const opt of globalOptions) {
      output.push(
        helper.formatItem(helper.optionTerm(opt), maxGlobalTermWidth, helper.optionDescription(opt), helper)
      );
    }
    output.push("");
  }

  // Examples footer
  output.push(helper.styleTitle("Examples:"));
  output.push("  ui-test setup quickstart");
  output.push("  ui-test improve e2e/login.yaml --apply --apply-assertions");
  output.push("  ui-test doctor");
  output.push("");
  output.push(helper.styleTitle("Tip:"));
  output.push("  If not globally installed, use: npx -y github:ddv1982/easy-e2e-testing doctor");
  output.push("");

  return output.join("\n");
}
