import type { AssetType, ObfuscatorConfig } from "../api/types";

export interface PipelineAsset {
  filePath: string;
  relativePath: string;
  type: AssetType;
  code: string;
}

export interface PipelineContext {
  config: ObfuscatorConfig;
  normalizedSeed: string;
  diagnostics: string[];
  stageLedger: Array<{ file: string; stages: string[] }>;
}

export interface PipelineArtifacts {
  assets: PipelineAsset[];
}

export interface PipelineRunOptions {
  mode?: "run" | "verify";
  jsonReportPath?: string;
}