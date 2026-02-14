import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerRecord } from "./commands/record.js";
import { registerPlay } from "./commands/play.js";
import { registerList } from "./commands/list.js";
import { registerExampleApp } from "./commands/example-app.js";
import { registerSetup } from "./commands/setup.js";
import { registerImprove } from "./commands/improve.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerBootstrap } from "./commands/bootstrap.js";
import { UserError, handleError } from "./utils/errors.js";
import { getCliVersion, isProjectLocalUiTestInvocation } from "./utils/runtime-info.js";

const STANDALONE_POLICY_HINT = [
  "Run ui-test in standalone mode instead:",
  "  npm i -g ui-test",
  "  ui-test bootstrap quickstart",
  "  npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart",
  "",
  "If ui-test is installed locally in this project:",
  "  1) Remove ui-test from dependencies/devDependencies in package.json",
  "  2) Run: npm uninstall ui-test",
  "  3) Run: npm i -g ui-test",
].join("\n");

export function run() {
  if (isProjectLocalUiTestInvocation(process.cwd(), process.argv[1])) {
    handleError(
      new UserError(
        "Project-local ui-test installs are not supported.",
        STANDALONE_POLICY_HINT
      )
    );
  }

  const program = new Command();

  program
    .name("ui-test")
    .description("No-code E2E testing — record and replay browser tests with YAML")
    .version(getCliVersion());

  program.addHelpText(
    "after",
    [
      "",
      "Examples:",
      "  ui-test bootstrap quickstart",
      "  ui-test improve e2e/login.yaml",
      "  ui-test improve e2e/login.yaml --apply --apply-assertions",
      "  ui-test improve e2e/login.yaml --apply-assertions --assertion-source snapshot-cli",
      "  ui-test doctor",
      "",
      "Tip:",
      "  Run `ui-test improve --help` to see all improve flags (including assertion source options).",
      "  If not globally installed yet, use one-off execution: `npx -y github:ddv1982/easy-e2e-testing doctor`.",
    ].join("\n")
  );

  registerInit(program);
  registerBootstrap(program);
  registerSetup(program);
  registerRecord(program);
  registerPlay(program);
  registerList(program);
  registerImprove(program);
  registerDoctor(program);
  registerExampleApp(program);

  program.parseAsync().catch(handleError);
}
