import { Command, Help } from "commander";
import { registerRecord } from "./commands/record.js";
import { registerPlay } from "./commands/play.js";
import { registerList } from "./commands/list.js";
import { registerExampleApp } from "./commands/example-app.js";
import { registerImprove } from "./commands/improve.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerSetup } from "./commands/setup.js";
import { handleError, UserError } from "./utils/errors.js";
import { getCliVersion, isProjectLocalUiTestInvocation } from "./utils/runtime-info.js";
import { buildUnifiedHelp } from "./utils/unified-help.js";

const STANDALONE_POLICY_HINT = [
  "Run ui-test in standalone mode instead:",
  "  Install ui-test globally (see README.md)",
  "  ui-test setup",
  "  For one-off usage, see README.md",
  "",
  "If ui-test is installed locally in this project:",
  "  1) Remove ui-test from dependencies/devDependencies in package.json",
  "  2) Run: npm uninstall ui-test",
  "  3) Install ui-test globally (see README.md)",
].join("\n");

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ui-test")
    .description("No-code E2E testing — record and replay browser tests with YAML")
    .version(getCliVersion())
    .configureHelp({
      formatHelp(cmd, helper) {
        // Use unified help for root command only; subcommands use default
        if (cmd.parent) {
          return Help.prototype.formatHelp.call(this, cmd, helper);
        }
        return buildUnifiedHelp(cmd, helper);
      },
    });

  registerSetup(program);
  registerRecord(program);
  registerPlay(program);
  registerList(program);
  registerImprove(program);
  registerDoctor(program);
  registerExampleApp(program);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  if (isProjectLocalUiTestInvocation(process.cwd(), argv[1])) {
    throw new UserError(
      "Project-local ui-test installs are not supported.",
      STANDALONE_POLICY_HINT
    );
  }

  const program = createProgram();
  await program.parseAsync(argv);
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  await run(argv).catch(handleError);
}
