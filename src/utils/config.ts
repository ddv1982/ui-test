import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export interface EasyE2EConfig {
  testDir?: string;
  baseUrl?: string;
  headed?: boolean;
  timeout?: number;
}

const CONFIG_FILENAMES = ["easy-e2e.config.yaml", "easy-e2e.config.yml"];

export async function loadConfig(): Promise<EasyE2EConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.resolve(filename);
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const data = yaml.load(content);
      if (data && typeof data === "object") {
        return data as EasyE2EConfig;
      }
    } catch {
      // file not found or invalid, try next
    }
  }

  // No config file found — use defaults
  return {};
}
