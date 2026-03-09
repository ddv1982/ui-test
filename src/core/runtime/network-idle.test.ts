import { describe, expect, it, vi } from "vitest";
import { errors as playwrightErrors, type Page } from "playwright";
import {
  isPlaywrightTimeoutError,
  waitForPostStepNetworkIdle,
} from "./network-idle.js";

describe("waitForPostStepNetworkIdle", () => {
  it("waits for network idle when enabled", async () => {
    const page = {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true)).resolves.toBe(false);
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle");
  });

  it("passes timeout to waitForLoadState when provided", async () => {
    const page = {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true, 1234)).resolves.toBe(false);
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 1234 });
  });

  it("returns timed out marker on network idle timeout", async () => {
    const page = {
      waitForLoadState: vi.fn().mockRejectedValue(new playwrightErrors.TimeoutError("timed out")),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true)).resolves.toBe(true);
  });

  it("throws non-timeout errors", async () => {
    const page = {
      waitForLoadState: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true)).rejects.toThrow("boom");
  });

  it("skips waiting when disabled", async () => {
    const page = {
      waitForLoadState: vi.fn(),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, false)).resolves.toBe(false);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });
});

describe("isPlaywrightTimeoutError", () => {
  it("detects playwright TimeoutError", () => {
    expect(isPlaywrightTimeoutError(new playwrightErrors.TimeoutError("x"))).toBe(true);
  });

  it("detects timeout errors by name fallback", () => {
    const err = new Error("x");
    err.name = "TimeoutError";

    expect(isPlaywrightTimeoutError(err)).toBe(true);
  });

  it("returns false for non-timeout errors", () => {
    expect(isPlaywrightTimeoutError(new Error("x"))).toBe(false);
  });
});
