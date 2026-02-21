import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";

const START_TIMEOUT_MS = 60_000;
const START_POLL_MS = 500;

export async function startPlayApp(
  startCommand: string,
  baseUrl: string
): Promise<ChildProcess> {
  const appProcess = spawn(startCommand, {
    shell: true,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  appProcess.on("error", (err) => {
    ui.error(`Failed to start app process: ${err.message}`);
  });

  await waitForReachableBaseUrl(baseUrl, appProcess, START_TIMEOUT_MS);
  return appProcess;
}

export async function stopStartedAppProcess(appProcess: ChildProcess): Promise<void> {
  let onExit: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    onExit = () => resolve();
    appProcess.once("exit", onExit);
  });

  if (appProcess.exitCode !== null || appProcess.killed) {
    appProcess.removeListener("exit", onExit!);
    return;
  }

  if (
    process.platform !== "win32" &&
    typeof appProcess.pid === "number" &&
    tryKillProcessGroup(appProcess.pid, "SIGTERM")
  ) {
    // wait for exit, fall back to SIGKILL after 2s
  } else {
    appProcess.kill("SIGTERM");
  }

  const ac1 = new AbortController();
  const exited = await Promise.race([
    exitPromise.then(() => {
      ac1.abort();
      return true;
    }),
    sleep(2000, undefined, { signal: ac1.signal })
      .then(() => false)
      .catch(() => false),
  ]);

  if (!exited) {
    ui.dim("App process did not exit after SIGTERM, sending SIGKILL...");
    if (process.platform !== "win32" && typeof appProcess.pid === "number") {
      tryKillProcessGroup(appProcess.pid, "SIGKILL");
    } else {
      appProcess.kill("SIGKILL");
    }
    const ac2 = new AbortController();
    await Promise.race([
      exitPromise.then(() => ac2.abort()),
      sleep(1000, undefined, { signal: ac2.signal }).catch(() => {}),
    ]);
  }
}

function tryKillProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

async function waitForReachableBaseUrl(
  baseUrl: string,
  childProcess: ChildProcess,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new UserError(
        "App process exited before becoming reachable.",
        "Check your startCommand and app logs."
      );
    }

    if (await isBaseUrlReachable(baseUrl, START_POLL_MS)) {
      ui.success(`App is reachable at ${baseUrl}`);
      return;
    }

    await sleep(START_POLL_MS);
  }

  throw new UserError(
    `Timed out waiting for app to become reachable at ${baseUrl}`,
    "Check start command output, or run ui-test play --no-start."
  );
}

async function isBaseUrlReachable(
  baseUrl: string,
  timeoutMs: number
): Promise<boolean> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      signal: abortController.signal,
    });
    return response.ok || response.status >= 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
