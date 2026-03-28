import fs from "node:fs/promises";
import path from "node:path";
import { defaultConfig } from "../api/defaults";
import type { ObfuscatorConfig } from "../api/types";
import { mergeConfig } from "../config/merge";

export async function loadConfig(configPath: string): Promise<ObfuscatorConfig> {
  const absolute = path.resolve(configPath);
  const raw = await fs.readFile(absolute, "utf8");
  const parsed = JSON.parse(raw) as Partial<ObfuscatorConfig>;
  return mergeConfig(defaultConfig, parsed);
}