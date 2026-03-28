import type { PipelineAsset, PipelineContext } from "../core/types";
import { applyHtmlNoopStructuralNoise } from "./html-noop-noise";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";

export function transformHtmlPass1(asset: PipelineAsset, context: PipelineContext): PipelineAsset {
  if (!context.config.pass1.enabled || !context.config.minify) {
    return asset;
  }

  const compact = asset.code
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  const transformed = `${compact}\n`;
  const diagnostics: string[] = [];

  if (context.config.pass1.html.rewriteInlineScripts) {
    const inlineScriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    for (const match of transformed.matchAll(inlineScriptPattern)) {
      const body = (match[1] ?? "").trim();
      if (body.length > 0) {
        diagnostics.push(
          createPass1Diagnostic(
            PASS1_DIAGNOSTIC_TAGS.htmlInlineUnsupported,
            asset.relativePath,
            "inline-script-rewrite-deferred"
          )
        );
        break;
      }
    }
  }

  if (context.config.pass1.html.rewriteInlineStyles) {
    const inlineStylePattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    for (const match of transformed.matchAll(inlineStylePattern)) {
      const body = (match[1] ?? "").trim();
      if (body.length > 0) {
        diagnostics.push(
          createPass1Diagnostic(
            PASS1_DIAGNOSTIC_TAGS.htmlInlineUnsupported,
            asset.relativePath,
            "inline-style-rewrite-deferred"
          )
        );
        break;
      }
    }
  }

  const noopNoise = applyHtmlNoopStructuralNoise(asset, context, transformed);
  diagnostics.push(...noopNoise.diagnostics);

  context.diagnostics.push(...diagnostics);

  return {
    ...asset,
    code: noopNoise.code
  };
}