import type { Command } from "commander";
import { runList } from "../app/services/list-service.js";

export function registerList(program: Command) {
  program
    .command("list")
    .description("List all recorded tests")
    .action(() => runList());
}
