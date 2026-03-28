import type { PipelineAsset, PipelineContext } from "../core/types";
import { applyCssNoopRuleNoise } from "./css-noop-noise";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";

export function transformCssPass1(asset: PipelineAsset, context: PipelineContext): PipelineAsset {
  if (!context.config.pass1.enabled || !context.config.minify) {
    return asset;
  }

  const compact = asset.code
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  let transformed = `${compact}\n`;
  const diagnostics: string[] = [];

  if (context.config.pass1.css.renameCustomProperties) {
    transformed = transformed.replace(/(^|[\n\r\t\s;{])(--[A-Za-z_][A-Za-z0-9_-]*)\s*:\s*/g, "$1$2:");
  }

  if (context.config.pass1.css.renameClasses && /\.[A-Za-z_][A-Za-z0-9_-]*/.test(transformed)) {
    diagnostics.push(
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.cssSelectorScopeUnsupported,
        asset.relativePath,
        "class-selector-rename-deferred-to-pass2"
      )
    );
  }

  if (context.config.pass1.css.renameIds && /#[A-Za-z_][A-Za-z0-9_-]*/.test(transformed)) {
    diagnostics.push(
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.cssSelectorScopeUnsupported,
        asset.relativePath,
        "id-selector-rename-deferred-to-pass2"
      )
    );
  }

  const noopNoise = applyCssNoopRuleNoise(asset, context, transformed);
  diagnostics.push(...noopNoise.diagnostics);

  context.diagnostics.push(...diagnostics);

  return {
    ...asset,
    code: noopNoise.code
  };
}