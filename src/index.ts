import { Command } from "commander";
import { handleError } from "./utils/errors.js";
import { registerInit } from "./commands/init.js";
import { registerRecord } from "./commands/record.js";
import { registerPlay } from "./commands/play.js";
import { registerList } from "./commands/list.js";
import { registerExampleApp } from "./commands/example-app.js";
import { registerSetup } from "./commands/setup.js";
import { registerImprove } from "./commands/improve.js";
import { registerDoctor } from "./commands/doctor.js";
import { getCliVersion } from "./utils/runtime-info.js";

export function run() {
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
      "  npx ui-test improve e2e/login.yaml",
      "  npx ui-test improve e2e/login.yaml --apply --apply-assertions",
      "  npx ui-test improve e2e/login.yaml --apply-assertions --assertion-source snapshot-cli",
      "  npx ui-test doctor",
      "",
      "Tip:",
      "  Run `npx ui-test improve --help` to see all improve flags (including assertion source options).",
    ].join("\n")
  );

  registerInit(program);
  registerSetup(program);
  registerRecord(program);
  registerPlay(program);
  registerList(program);
  registerImprove(program);
  registerDoctor(program);
  registerExampleApp(program);

  program.parseAsync().catch(handleError);
}
