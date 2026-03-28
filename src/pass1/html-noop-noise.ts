import { hashText } from "../core/seed";
import type { PipelineAsset, PipelineContext } from "../core/types";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";

export interface Pass1TransformResult {
  code: string;
  diagnostics: string[];
}

const BODY_CLOSE_PATTERN = /<\/body\s*>/i;

export function applyHtmlNoopStructuralNoise(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): Pass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify || context.config.pass1.html.noopStructuralNoise !== "safe") {
    return { code, diagnostics: [] };
  }

  if (/<script\b[^>]*\bon\w+\s*=|<[^>]+\bon\w+\s*=/.test(code)) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.htmlNoopStructureSkipped,
          asset.relativePath,
          "inline-event-handler-present"
        )
      ]
    };
  }

  const marker = hashText(`${context.normalizedSeed}:${asset.relativePath}:pass1-html-noop`).slice(0, 8);
  const comment = `<!-- p1-noop:${marker} -->`;

  if (BODY_CLOSE_PATTERN.test(code)) {
    return {
      code: code.replace(BODY_CLOSE_PATTERN, `${comment}\n</body>`),
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.htmlNoopStructureApplied,
          asset.relativePath,
          "body-comment-inserted"
        )
      ]
    };
  }

  return {
    code: `${code.replace(/\s+$/, "")}\n${comment}\n`,
    diagnostics: [
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.htmlNoopStructureApplied,
        asset.relativePath,
        "tail-comment-inserted"
      )
    ]
  };
}
