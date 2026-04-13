import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveLocatorMock = vi.fn();

vi.mock("../runtime/locator-runtime.js", () => ({
  resolveLocator: (...args: unknown[]) => resolveLocatorMock(...args),
}));

import { prepareScopedStepSnapshot } from "./step-snapshot-scope.js";

describe("prepareScopedStepSnapshot", () => {
  beforeEach(() => {
    resolveLocatorMock.mockReset();
  });

  it("uses richer page snapshots for body scope when supported", async () => {
    const landmarkLocator = {
      first: vi.fn().mockReturnThis(),
      ariaSnapshot: vi.fn().mockRejectedValue(new Error("No landmark available")),
    };
    const page = {
      ariaSnapshot: vi
        .fn()
        .mockResolvedValueOnce("page before")
        .mockResolvedValueOnce("page after"),
      locator: vi.fn((selector: string) => {
        if (selector === "dialog, [role='dialog'], main, [role='main'], form") {
          return landmarkLocator;
        }
        throw new Error(`Unexpected selector: ${selector}`);
      }),
    } as any;

    const prepared = await prepareScopedStepSnapshot(page, { action: "navigate", url: "/" } as any, 250);

    expect(prepared?.scope).toBe("body");
    expect(prepared?.preSnapshot).toBe("page before");
    expect(page.ariaSnapshot).toHaveBeenNthCalledWith(1, {
      timeout: 250,
      mode: "ai",
      depth: 6,
    });
    expect(page.locator).toHaveBeenCalledTimes(1);

    const postSnapshot = await prepared?.capturePostSnapshot();

    expect(postSnapshot).toBe("page after");
    expect(page.ariaSnapshot).toHaveBeenNthCalledWith(2, {
      timeout: 250,
      mode: "ai",
      depth: 6,
    });
    expect(page.locator).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy body locator snapshots when rich page options are unsupported", async () => {
    const landmarkLocator = {
      first: vi.fn().mockReturnThis(),
      ariaSnapshot: vi.fn().mockRejectedValue(new Error("No landmark available")),
    };
    const bodyLocator = {
      ariaSnapshot: vi
        .fn()
        .mockResolvedValueOnce("body before")
        .mockResolvedValueOnce("body after"),
    };
    const page = {
      ariaSnapshot: vi.fn().mockRejectedValue(new Error("Page aria snapshots unavailable")),
      locator: vi.fn((selector: string) => {
        if (selector === "dialog, [role='dialog'], main, [role='main'], form") {
          return landmarkLocator;
        }
        if (selector === "body") {
          return bodyLocator;
        }
        throw new Error(`Unexpected selector: ${selector}`);
      }),
    } as any;

    const prepared = await prepareScopedStepSnapshot(page, { action: "navigate", url: "/" } as any, 250);

    expect(prepared?.scope).toBe("body");
    expect(prepared?.preSnapshot).toBe("body before");
    expect(page.ariaSnapshot).toHaveBeenNthCalledWith(1, {
      timeout: 250,
      mode: "ai",
      depth: 6,
    });
    expect(bodyLocator.ariaSnapshot).toHaveBeenNthCalledWith(1, { timeout: 250 });

    const postSnapshot = await prepared?.capturePostSnapshot();

    expect(postSnapshot).toBe("body after");
    expect(page.ariaSnapshot).toHaveBeenNthCalledWith(2, {
      timeout: 250,
      mode: "ai",
      depth: 6,
    });
    expect(bodyLocator.ariaSnapshot).toHaveBeenNthCalledWith(2, { timeout: 250 });
  });
});
