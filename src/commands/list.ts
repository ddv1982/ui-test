import type { Command } from "commander";
import { runList } from "../app/services/list-service.js";
import { handleError } from "../utils/errors.js";

export function registerList(program: Command) {
  program
    .command("list")
    .description("List all recorded tests")
    .action(async () => {
      try {
        await runList();
      } catch (err) {
        handleError(err);
      }
    });
}
