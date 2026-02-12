import { chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(scriptDir, "../dist/bin/ui-test.js");

await chmod(binPath, 0o755);
