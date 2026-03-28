import fs from "node:fs/promises";
import path from "node:path";
import type { ObfuscatorConfig } from "../api/types";
import type { PipelineAsset } from "../core/types";

export async function writeAssets(config: ObfuscatorConfig, assets: PipelineAsset[]): Promise<string[]> {
  const outRoot = path.resolve(config.root, config.outDir);
  await fs.mkdir(outRoot, { recursive: true });

  const outputs: string[] = [];
  for (const asset of assets) {
    const destination = path.resolve(outRoot, asset.relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, asset.code, "utf8");
    outputs.push(destination);
  }
  return outputs;
}