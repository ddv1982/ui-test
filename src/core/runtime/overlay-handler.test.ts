import { describe, expect, it, vi } from "vitest";
import type { Locator, Page } from "playwright";
import { formatOverlayHandlerEvent, installOverlayHandlers } from "./overlay-handler.js";

function locatorStub(id: string): Locator {
  return {
    toString: () => id,
  } as unknown as Locator;
}

describe("installOverlayHandlers", () => {
  it("registers handlers and removes them on dispose", async () => {
    const registeredLocators: Locator[] = [];
    const removedLocators: Locator[] = [];
    const locators = [locatorStub("consent"), locatorStub("overlay")];
    let locatorReadIndex = 0;

    const page = {
      locator: vi.fn(() => locators[locatorReadIndex++]),
      addLocatorHandler: vi.fn(async (locator: Locator) => {
        registeredLocators.push(locator);
      }),
      removeLocatorHandler: vi.fn(async (locator: Locator) => {
        removedLocators.push(locator);
      }),
    } as unknown as Page;

    const registration = await installOverlayHandlers(page);
    expect(registeredLocators).toHaveLength(2);
    await registration.dispose();
    expect(removedLocators).toHaveLength(2);
    expect(removedLocators[0]).toBe(registeredLocators[0]);
    expect(removedLocators[1]).toBe(registeredLocators[1]);
  });

  it("emits dismissal events when a handler dismisses an overlay", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const events: string[] = [];
    const locators = [locatorStub("consent"), locatorStub("overlay")];
    let locatorReadIndex = 0;

    const page = {
      locator: vi.fn(() => locators[locatorReadIndex++]),
      addLocatorHandler: vi.fn(
        async (_locator: Locator, callback: () => Promise<void>) => {
          callbacks.push(callback);
        }
      ),
      removeLocatorHandler: vi.fn(async () => {}),
    } as unknown as Page;

    await installOverlayHandlers(
      page,
      {
        onDismissed: (event) => {
          events.push(formatOverlayHandlerEvent(event));
        },
      },
      {
        dismissOverlayFn: vi.fn(async () => ({
          dismissed: true,
          category: "non_cookie_overlay",
          strategy: "modal_close_control",
          frameUrl: "https://example.test",
        })),
      }
    );

    expect(callbacks).toHaveLength(2);
    await callbacks[0]?.();
    expect(events.some((event) => event.includes("Playwright overlay handler dismissed"))).toBe(
      true
    );
  });
});
