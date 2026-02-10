import { ui } from "./ui.js";

export class UserError extends Error {
  constructor(
    message: string,
    public hint?: string
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class ValidationError extends UserError {
  constructor(
    message: string,
    public issues: string[]
  ) {
    super(message, "Fix the issues above and try again.");
    this.name = "ValidationError";
  }
}

export function handleError(err: unknown): never {
  if (err instanceof ValidationError) {
    ui.error(err.message);
    for (const issue of err.issues) {
      console.error("  - " + issue);
    }
    if (err.hint) ui.dim(err.hint);
  } else if (err instanceof UserError) {
    ui.error(err.message);
    if (err.hint) ui.dim(err.hint);
  } else if (err instanceof Error) {
    ui.error(err.message);
  } else {
    ui.error(String(err));
  }
  process.exit(1);
}
