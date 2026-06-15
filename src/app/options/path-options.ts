import { UserError } from "../../utils/errors.js";

export function cleanRequiredPath(
  input: string,
  label: string,
  hintFlag: string
): string {
  const value = input.trim();
  if (value.length === 0) {
    throw new UserError(
      `Invalid ${label}: empty path`,
      `Set a non-empty path with ${hintFlag}.`
    );
  }
  return value;
}

export function cleanOptionalPath(
  input: string | undefined,
  label: string,
  hintFlag: string
): string | undefined {
  if (input === undefined) return undefined;
  return cleanRequiredPath(input, label, hintFlag);
}
