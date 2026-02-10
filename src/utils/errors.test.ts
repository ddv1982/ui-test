import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserError, ValidationError, handleError } from "./errors.js";

describe("UserError", () => {
  it("should create error with message", () => {
    const error = new UserError("Test error");
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("UserError");
  });

  it("should create error with message and hint", () => {
    const error = new UserError("Test error", "Try this instead");
    expect(error.message).toBe("Test error");
    expect(error.hint).toBe("Try this instead");
  });

  it("should be instance of Error", () => {
    const error = new UserError("Test error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserError);
  });
});

describe("ValidationError", () => {
  it("should create error with message and issues", () => {
    const issues = ["Issue 1", "Issue 2"];
    const error = new ValidationError("Validation failed", issues);
    expect(error.message).toBe("Validation failed");
    expect(error.issues).toEqual(issues);
    expect(error.name).toBe("ValidationError");
  });

  it("should inherit from UserError", () => {
    const error = new ValidationError("Test", []);
    expect(error).toBeInstanceOf(UserError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it("should have default hint", () => {
    const error = new ValidationError("Test", ["Issue"]);
    expect(error.hint).toBe("Fix the issues above and try again.");
  });

  it("should handle empty issues array", () => {
    const error = new ValidationError("Test", []);
    expect(error.issues).toEqual([]);
  });
});

describe("handleError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should handle ValidationError with issues", () => {
    const error = new ValidationError("Validation failed", [
      "steps.0: Invalid",
      "name: Required",
    ]);

    handleError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Validation failed")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("  - steps.0: Invalid");
    expect(consoleErrorSpy).toHaveBeenCalledWith("  - name: Required");
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle UserError with hint", () => {
    const error = new UserError("Something went wrong", "Try again");

    handleError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Something went wrong")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle UserError without hint", () => {
    const error = new UserError("Something went wrong");

    handleError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Something went wrong")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle generic Error", () => {
    const error = new Error("Generic error");

    handleError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Generic error")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle non-Error values", () => {
    handleError("String error");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("String error")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should always exit with code 1", () => {
    handleError(new Error("Test"));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
