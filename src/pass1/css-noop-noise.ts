import { createPrng } from "../core/seed";
import type { PipelineAsset, PipelineContext } from "../core/types";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";

export interface Pass1TransformResult {
  code: string;
  diagnostics: string[];
}

const RULE_PATTERN = /([^{}@]+)\{([^{}]*)\}/g;
const CUSTOM_PROPERTY_PATTERN = /(--[A-Za-z_][A-Za-z0-9_-]*)\s*:\s*([^;{}]+);?/;

export function applyCssNoopRuleNoise(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): Pass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify || context.config.pass1.css.noopRuleNoise !== "safe") {
    return { code, diagnostics: [] };
  }

  const matches = [...code.matchAll(RULE_PATTERN)];
  const candidates = matches.filter((match) => CUSTOM_PROPERTY_PATTERN.test(match[2] ?? ""));

  if (candidates.length === 0) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.cssNoopRuleSkipped,
          asset.relativePath,
          "no-custom-property-rule"
        )
      ]
    };
  }

  const prng = createPrng(`${context.normalizedSeed}:${asset.relativePath}:pass1-css-noop`);
  const selectedIndex = Math.floor(prng() * candidates.length);
  const selected = candidates[Math.max(0, Math.min(candidates.length - 1, selectedIndex))];
  const ruleStart = selected.index ?? -1;
  if (ruleStart < 0) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.cssNoopRuleSkipped,
          asset.relativePath,
          "failed-to-locate-selected-rule"
        )
      ]
    };
  }

  const selector = selected[1] ?? "";
  const body = selected[2] ?? "";
  const declarationMatch = CUSTOM_PROPERTY_PATTERN.exec(body);
  if (!declarationMatch) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.cssNoopRuleSkipped,
          asset.relativePath,
          "selected-rule-missing-custom-property"
        )
      ]
    };
  }

  const declarationName = declarationMatch[1] ?? "--noop";
  const declarationValue = (declarationMatch[2] ?? "").trim();
  const normalizedBody = body.trimEnd();
  const separator = normalizedBody.endsWith(";") || normalizedBody.length === 0 ? "" : ";";
  const duplicatedBody = `${normalizedBody}${separator}\n  ${declarationName}: ${declarationValue};\n`;
  const replacedRule = `${selector}{${duplicatedBody}}`;
  const selectedText = selected[0] ?? "";

  return {
    code: `${code.slice(0, ruleStart)}${replacedRule}${code.slice(ruleStart + selectedText.length)}`,
    diagnostics: [
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.cssNoopRuleApplied,
        asset.relativePath,
        `duplicated-${declarationName}`
      )
    ]
  };
}
