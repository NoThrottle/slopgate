import type { PipelineAsset, PipelineContext } from "../core/types";
import { applyJsControlFlowFlattening } from "./js-control-flow";
import { applyJsDeadCodeInjection, applyJsNoopNestingNoise } from "./js-dead-code";
import { applyJsSemanticNoise } from "./js-semantic-noise";
import { applyJsStringEncoding } from "./js-string-encoding";

export function transformJsPass1(asset: PipelineAsset, context: PipelineContext): PipelineAsset {
  if (!context.config.pass1.enabled || !context.config.minify) {
    return asset;
  }

  const compact = asset.code
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  const compactedCode = `${compact}\n`;
  const compactedAsset: PipelineAsset = {
    ...asset,
    code: compactedCode
  };

  const stringEncoding = applyJsStringEncoding(compactedAsset, context);
  const controlFlow = applyJsControlFlowFlattening(asset, context, stringEncoding.code);
  const deadCode = applyJsDeadCodeInjection(asset, context, controlFlow.code);
  const semanticNoise = applyJsSemanticNoise(asset, context, deadCode.code);
  const noopNesting = applyJsNoopNestingNoise(asset, context, semanticNoise.code);

  context.diagnostics.push(...stringEncoding.diagnostics);
  context.diagnostics.push(...controlFlow.diagnostics);
  context.diagnostics.push(...deadCode.diagnostics);
  context.diagnostics.push(...semanticNoise.diagnostics);
  context.diagnostics.push(...noopNesting.diagnostics);

  return {
    ...asset,
    code: noopNesting.code
  };
}