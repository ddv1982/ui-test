import { UserError } from "../utils/errors.js";

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function parseOptionalArgument(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseRequiredArgument(value: unknown, name: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new UserError(`Missing required argument: ${name}`);
}
