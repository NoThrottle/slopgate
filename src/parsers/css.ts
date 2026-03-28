import type { PipelineAsset } from "../core/types";

export function parseCss(asset: PipelineAsset): PipelineAsset {
  return {
    ...asset,
    code: asset.code.replace(/\r\n?/g, "\n")
  };
}