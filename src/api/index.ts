import path from "node:path";
import { runPipeline } from "../core/pipeline";
import { loadConfig } from "../cli/config-loader";
import { mergeConfig } from "../config/merge";
import { validateConfig } from "../config/validation";
import { defaultConfig } from "./defaults";
import type { ObfuscateOptions, ObfuscationResult, ObfuscatorConfig, VerifyOptions } from "./types";

export function defineConfig(config: Partial<ObfuscatorConfig>): ObfuscatorConfig {
  return mergeConfig(defaultConfig, config);
}

export async function obfuscate(options: ObfuscateOptions): Promise<ObfuscationResult> {
  const finalConfig = await prepareFinalConfig(options);

  return runPipeline(finalConfig, {
    mode: "run",
    jsonReportPath: options.jsonReportPath
  });
}

export async function verify(options: VerifyOptions): Promise<ObfuscationResult> {
  const finalConfig = await prepareFinalConfig(options);

  return runPipeline(finalConfig, {
    mode: "verify"
  });
}

async function prepareFinalConfig(options: VerifyOptions): Promise<ObfuscatorConfig> {
  const root = options.config?.root ?? process.cwd();
  const loadedConfig = options.configPath
    ? await loadConfig(options.configPath)
    : mergeConfig(defaultConfig, options.config ?? {});
  const merged = mergeConfig(loadedConfig, options.overrides ?? {});
  const resolvedRoot = path.resolve(root, merged.root);
  const finalConfig = mergeConfig(merged, { root: resolvedRoot });
  const issues = validateConfig(finalConfig);
  if (issues.length > 0) {
    const message = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Config validation failed: ${message}`);
  }

  return finalConfig;
}