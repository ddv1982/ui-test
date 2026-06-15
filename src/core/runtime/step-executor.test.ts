import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { executeRuntimeStep } from "./step-executor.js";

function timeoutError(): Error {
  const err = new Error("timed out");
  err.name = "TimeoutError";
  return err;
}

function createMockPage() {
  const clickMock = vi.fn(async () => {});
  const dblclickMock = vi.fn(async () => {});
  const fillMock = vi.fn(async () => {});
  const pressMock = vi.fn(async () => {});
  const checkMock = vi.fn(async () => {});
  const uncheckMock = vi.fn(async () => {});
  const hoverMock = vi.fn(async () => {});
  const selectOptionMock = vi.fn(async () => {});
  const waitForMock = vi.fn(async () => {});
  const textContentMock = vi.fn(async () => "");
  const inputValueMock = vi.fn(async () => "");
  const isCheckedMock = vi.fn(async () => false);
  const isEnabledMock = vi.fn(async () => true);
  const waitForURLMock = vi.fn(async () => {});
  const waitForFunctionMock = vi.fn(async () => ({}));
  const locatorMock = vi.fn(() => ({
    click: clickMock,
    dblclick: dblclickMock,
    fill: fillMock,
    press: pressMock,
    check: checkMock,
    uncheck: uncheckMock,
    hover: hoverMock,
    selectOption: selectOptionMock,
    waitFor: waitForMock,
    textContent: textContentMock,
    inputValue: inputValueMock,
    isChecked: isCheckedMock,
    isEnabled: isEnabledMock,
    locator: vi.fn(),
  }));

  const page = {
    locator: locatorMock,
    goto: vi.fn(async () => undefined),
    url: vi.fn(() => "about:blank"),
    title: vi.fn(async () => ""),
    waitForURL: waitForURLMock,
    waitForFunction: waitForFunctionMock,
  } as unknown as Page;
  return {
    page,
    locatorMock,
    clickMock,
    dblclickMock,
    fillMock,
    pressMock,
    checkMock,
    uncheckMock,
    hoverMock,
    selectOptionMock,
    waitForMock,
    textContentMock,
    inputValueMock,
    isCheckedMock,
    isEnabledMock,
    waitForURLMock,
    waitForFunctionMock,
  };
}

function makeCssClickStep(overrides: Partial<Step> = {}): Step {
  return {
    action: "click",
    target: { value: "#btn", kind: "css", source: "manual" },
    ...overrides,
  } as Step;
}

describe("executeRuntimeStep per-step timeout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses step.timeout when present instead of options.timeout", async () => {
    const { page, clickMock } = createMockPage();
    const step = makeCssClickStep({ timeout: 2000 });

    await executeRuntimeStep(page, step, {
      timeout: 10_000,
      mode: "playback",
    });

    expect(clickMock).toHaveBeenCalledWith({ timeout: 2000 });
  });

  it("falls back to options.timeout when step has no timeout", async () => {
    const { page, clickMock } = createMockPage();
    const step = makeCssClickStep();

    await executeRuntimeStep(page, step, {
      timeout: 10_000,
      mode: "playback",
    });

    expect(clickMock).toHaveBeenCalledWith({ timeout: 10_000 });
  });
});

describe("executeRuntimeStep interactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("navigates using the resolved URL and timeout", async () => {
    const { page } = createMockPage();
    vi.mocked(page.url).mockReturnValue("https://example.test/app/current");

    await executeRuntimeStep(
      page,
      { action: "navigate", url: "/settings" } as Step,
      { timeout: 10_000, baseUrl: "https://example.test/app/", mode: "playback" }
    );

    expect(page.goto).toHaveBeenCalledWith("https://example.test/settings", { timeout: 10_000 });
  });

  it("supports dblclick, fill, press, check, uncheck, hover, and select actions", async () => {
    const {
      page,
      dblclickMock,
      fillMock,
      pressMock,
      checkMock,
      uncheckMock,
      hoverMock,
      selectOptionMock,
    } = createMockPage();

    const target = { value: "#field", kind: "css", source: "manual" } as const;

    await executeRuntimeStep(page, { action: "dblclick", target } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "fill", target, text: "hello" } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "press", target, key: "Enter" } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "check", target } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "uncheck", target } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "hover", target } as Step, {
      timeout: 5_000,
      mode: "playback",
    });
    await executeRuntimeStep(page, { action: "select", target, value: "us" } as Step, {
      timeout: 5_000,
      mode: "playback",
    });

    expect(dblclickMock).toHaveBeenCalledWith({ timeout: 5_000 });
    expect(fillMock).toHaveBeenCalledWith("hello", { timeout: 5_000 });
    expect(pressMock).toHaveBeenCalledWith("Enter", { timeout: 5_000 });
    expect(checkMock).toHaveBeenCalledWith({ timeout: 5_000 });
    expect(uncheckMock).toHaveBeenCalledWith({ timeout: 5_000 });
    expect(hoverMock).toHaveBeenCalledWith({ timeout: 5_000 });
    expect(selectOptionMock).toHaveBeenCalledWith("us", { timeout: 5_000 });
  });
});

describe("executeRuntimeStep assertions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("waits for visibility when asserting visible", async () => {
    const { page, waitForMock } = createMockPage();

    await executeRuntimeStep(
      page,
      {
        action: "assertVisible",
        target: { value: "#status", kind: "css", source: "manual" },
      } as Step,
      { timeout: 3_000, mode: "playback" }
    );

    expect(waitForMock).toHaveBeenCalledWith({ state: "visible", timeout: 3_000 });
  });

  it("skips locator work for analysis-only assertions", async () => {
    const { page, locatorMock } = createMockPage();

    await executeRuntimeStep(
      page,
      {
        action: "assertVisible",
        target: { value: "#status", kind: "css", source: "manual" },
      } as Step,
      { timeout: 3_000, mode: "analysis" }
    );

    expect(locatorMock).not.toHaveBeenCalled();
  });

  it("passes assertText when the text content includes the expected substring", async () => {
    const { page, waitForMock, textContentMock } = createMockPage();
    textContentMock.mockResolvedValue("Hello from the page");

    await executeRuntimeStep(
      page,
      {
        action: "assertText",
        target: { value: "#message", kind: "css", source: "manual" },
        text: "from the page",
      } as Step,
      { timeout: 2_000, mode: "playback" }
    );

    expect(waitForMock).toHaveBeenCalledWith({ state: "visible", timeout: 2_000 });
    expect(textContentMock).toHaveBeenCalledWith({ timeout: 2_000 });
  });

  it("requires exact text when assertText exact is true", async () => {
    const { page, textContentMock } = createMockPage();
    textContentMock.mockResolvedValue("Hello from the page");

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertText",
          target: { value: "#message", kind: "css", source: "manual" },
          text: "from the page",
          exact: true,
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected text 'from the page' but got 'Hello from the page'");

    textContentMock.mockResolvedValue("from the page");

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertText",
          target: { value: "#message", kind: "css", source: "manual" },
          text: "from the page",
          exact: true,
        } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("normalizes whitespace for exact assertText", async () => {
    const { page, textContentMock } = createMockPage();
    textContentMock.mockResolvedValue("  Hello\n\nfrom\t the\u200b page  ");

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertText",
          target: { value: "#message", kind: "css", source: "manual" },
          text: "Hello from the page",
          exact: true,
        } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("retries assertText until the expected text appears", async () => {
    const { page, textContentMock } = createMockPage();
    textContentMock.mockResolvedValueOnce("Loading").mockResolvedValue("Ready now");

    await executeRuntimeStep(
      page,
      {
        action: "assertText",
        target: { value: "#message", kind: "css", source: "manual" },
        text: "Ready",
      } as Step,
      { timeout: 100, mode: "playback" }
    );

    expect(textContentMock).toHaveBeenCalledTimes(2);
  });

  it("throws a descriptive error when assertText does not match", async () => {
    const { page, textContentMock } = createMockPage();
    textContentMock.mockImplementation(async () => null as unknown as string);

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertText",
          target: { value: "#message", kind: "css", source: "manual" },
          text: "expected text",
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected text 'expected text' but got '(empty)'");
  });

  it("passes assertValue after a transient mismatch", async () => {
    const { page, inputValueMock } = createMockPage();
    inputValueMock.mockResolvedValueOnce("guest").mockResolvedValue("admin");

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertValue",
          target: { value: "#username", kind: "css", source: "manual" },
          value: "admin",
        } as Step,
        { timeout: 2_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(inputValueMock).toHaveBeenCalledTimes(2);
  });

  it("throws when assertValue never matches before timeout", async () => {
    const { page, inputValueMock } = createMockPage();
    inputValueMock.mockResolvedValue("guest");

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertValue",
          target: { value: "#username", kind: "css", source: "manual" },
          value: "admin",
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected value 'admin' but got 'guest'");
  });

  it("uses the default checked expectation and retries unchecked state", async () => {
    const { page, isCheckedMock } = createMockPage();
    isCheckedMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertChecked",
          target: { value: "#tos", kind: "css", source: "manual" },
        } as Step,
        { timeout: 2_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertChecked",
          target: { value: "#tos", kind: "css", source: "manual" },
          checked: false,
        } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("throws when assertChecked never reaches expected state", async () => {
    const { page, isCheckedMock } = createMockPage();
    isCheckedMock.mockResolvedValue(true);

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertChecked",
          target: { value: "#tos", kind: "css", source: "manual" },
          checked: false,
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected element to be unchecked");
  });

  it("uses Playwright page waits for assertUrl and assertTitle", async () => {
    const { page, waitForURLMock, waitForFunctionMock } = createMockPage();

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.test/settings" } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(waitForURLMock).toHaveBeenCalledWith(
      /^https:\/\/example\.test\/settings$/,
      { timeout: 100 }
    );

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertTitle", title: "Settings" } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(waitForFunctionMock).toHaveBeenCalledWith(
      expect.any(Function),
      "Settings",
      { timeout: 100 }
    );
  });

  it("throws descriptive errors when assertUrl or assertTitle waits time out", async () => {
    const { page, waitForURLMock, waitForFunctionMock } = createMockPage();
    vi.mocked(page.url).mockReturnValue("https://example.test/profile");
    vi.mocked(page.title).mockResolvedValue("Example Dashboard");
    waitForURLMock.mockRejectedValueOnce(timeoutError());
    waitForFunctionMock.mockRejectedValueOnce(timeoutError());

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.test/settings" } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow('URL "https://example.test/profile" does not match pattern "https://example.test/settings"');

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertTitle", title: "Settings" } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected title to contain 'Settings' but got 'Example Dashboard'");
  });

  it("retries assertEnabled until expectations pass", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => true).mockResolvedValueOnce(false).mockResolvedValue(true);
    const page = {
      locator: vi.fn(() => ({ waitFor, isEnabled })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
        } as Step,
        { timeout: 100, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it("throws when assertEnabled expectations never pass", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => false).mockResolvedValue(false);
    const page = {
      locator: vi.fn(() => ({ waitFor, isEnabled })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected element to be enabled");

    isEnabled.mockResolvedValue(true);

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
          enabled: false,
        } as Step,
        { timeout: 1, mode: "playback" }
      )
    ).rejects.toThrow("Expected element to be disabled");
  });
});

describe("executeRuntimeStep assertUrl", () => {
  it("matches literal URLs that contain regex special characters", async () => {
    const waitForURL = vi.fn(async () => {});
    const page = {
      url: vi.fn(() => "https://example.com/search?q=test.1"),
      waitForURL,
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.com/search?q=test.1" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(waitForURL).toHaveBeenCalledWith(
      /^https:\/\/example\.com\/search\?q=test\.1$/,
      { timeout: 10_000 }
    );
  });

  it("supports wildcard matching while escaping non-wildcard characters", async () => {
    const waitForURL = vi.fn(async () => {});
    const page = {
      url: vi.fn(() => "https://example.com/items/42/details?view=full.1"),
      waitForURL,
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.com/items/*/details?view=full.1" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(waitForURL).toHaveBeenCalledWith(
      /^https:\/\/example\.com\/items\/.*\/details\?view=full\.1$/,
      { timeout: 10_000 }
    );
  });
});

describe("executeRuntimeStep assertTitle", () => {
  it("passes when the current page title contains the expected value", async () => {
    const waitForFunction = vi.fn(async () => ({}));
    const page = {
      title: vi.fn(async () => "Settings - Example App"),
      waitForFunction,
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertTitle", title: "Settings" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), "Settings", {
      timeout: 10_000,
    });
  });
});

describe("executeRuntimeStep assertEnabled", () => {
  it("passes when assertEnabled expects enabled state", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => true);
    const page = {
      locator: vi.fn(() => ({
        waitFor,
        isEnabled,
      })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
        } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("passes when assertEnabled expects disabled state", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => false);
    const page = {
      locator: vi.fn(() => ({
        waitFor,
        isEnabled,
      })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
          enabled: false,
        } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });
});
