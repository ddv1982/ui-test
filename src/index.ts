import { Command } from "commander";
import { handleError } from "./utils/errors.js";
import { registerInit } from "./commands/init.js";
import { registerRecord } from "./commands/record.js";
import { registerPlay } from "./commands/play.js";
import { registerList } from "./commands/list.js";
import { registerSetupGit } from "./commands/setup-git.js";

export function run() {
  const program = new Command();

  program
    .name("easy-e2e")
    .description("No-code E2E testing — record and replay browser tests with YAML")
    .version("0.1.0");

  registerInit(program);
  registerRecord(program);
  registerPlay(program);
  registerList(program);
  registerSetupGit(program);

  program.parseAsync().catch(handleError);
}
