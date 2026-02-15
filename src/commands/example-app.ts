import type { Command } from "commander";
import { createServer, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5173;
const APP_DIR = fileURLToPath(new URL("../../examples/vue-app", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

interface ExampleAppOptions {
  host?: string;
  port?: string;
}

export function registerExampleApp(program: Command) {
  program
    .command("example-app")
    .description("Serve the built-in Vue example app")
    .option("--host <host>", "Host to bind", DEFAULT_HOST)
    .option("--port <port>", "Port to bind", String(DEFAULT_PORT))
    .action(async (opts: unknown) => {
      try {
        await runExampleApp(parseExampleAppOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runExampleApp(opts: ExampleAppOptions) {
  const host = (opts.host ?? DEFAULT_HOST).trim();
  const port = Number(opts.port ?? String(DEFAULT_PORT));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UserError(
      `Invalid port: ${opts.port}`,
      "Use a valid TCP port between 1 and 65535."
    );
  }

  const server = createServer((req, res) => {
    void serveExampleAsset(req.url ?? "/", res).catch(() => {
      writeResponse(res, 500, "text/plain; charset=utf-8", "Internal server error");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const close = () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  ui.success(`Serving Vue example app at http://${host}:${port}`);
  ui.dim("Press Ctrl+C to stop.");

  await new Promise<void>(() => {
    // Keep process alive until signal terminates.
  });
}

async function serveExampleAsset(requestPath: string, res: ServerResponse): Promise<void> {
  const normalizedPath = normalizeRequestPath(requestPath);
  const filePath = path.join(APP_DIR, normalizedPath);

  if (!filePath.startsWith(APP_DIR)) {
    writeResponse(res, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const body = await fs.readFile(finalPath);
    const ext = path.extname(finalPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    writeResponse(res, 200, contentType, body);
  } catch {
    writeResponse(res, 404, "text/plain; charset=utf-8", "Not found");
  }
}

function normalizeRequestPath(requestPath: string): string {
  const withoutQuery = requestPath.split("?")[0] ?? "/";
  let decoded = "/";

  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = "/";
  }

  const cleaned = decoded === "/" ? "/index.html" : decoded;
  return cleaned.replace(/^\/+/, "");
}

function writeResponse(
  res: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string | Buffer
): void {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function parseExampleAppOptions(value: unknown): ExampleAppOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    host: asOptionalString(record.host),
    port: asOptionalString(record.port),
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export { runExampleApp, normalizeRequestPath };
