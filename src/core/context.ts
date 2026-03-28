import type { ObfuscatorConfig } from "../api/types";
import { normalizeSeed } from "./seed";
import type { PipelineContext } from "./types";

export function createPipelineContext(config: ObfuscatorConfig): PipelineContext {
  return {
    config,
    normalizedSeed: normalizeSeed(config.seed),
    diagnostics: [],
    stageLedger: []
  };
}