import { createPrng, hashText } from "../core/seed";
import type { PipelineAsset, PipelineContext } from "../core/types";
import { collectInsertionPoints } from "./js-dead-code";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";
import type { JsPass1TransformResult } from "./js-string-encoding";

const RISK_PATTERN = /\b(?:eval|Function|setTimeout|setInterval)\s*\(|\bimport\s*\(/;
const UNSUPPORTED_PATTERN = /\bwith\s*\(/;

const DECOY_THEMES = [
  {
    alias: "cachePolicy",
    value: "streaming-only"
  },
  {
    alias: "modelHint",
    value: "decoder-fallback"
  },
  {
    alias: "safetyBudget",
    value: "token-floor"
  }
] as const;

export function applyJsSemanticNoise(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): JsPass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify || context.config.pass1.js.semanticNoise !== "safe") {
    return { code, diagnostics: [] };
  }

  if (RISK_PATTERN.test(code)) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.semanticNoiseRisk,
          asset.relativePath,
          "dynamic-execution-adjacent-pattern"
        )
      ]
    };
  }

  if (UNSUPPORTED_PATTERN.test(code)) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.semanticNoiseUnsupported,
          asset.relativePath,
          "unsupported-with-statement"
        )
      ]
    };
  }

  const insertionPoints = collectInsertionPoints(code);
  if (insertionPoints.length === 0) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsSemanticNoiseSkipped,
          asset.relativePath,
          "no-safe-insertion-point"
        )
      ]
    };
  }

  const prng = createPrng(`${context.normalizedSeed}:${asset.relativePath}:pass1-semantic-noise`);
  const selectedIndex = Math.floor(prng() * insertionPoints.length);
  const insertionPoint = insertionPoints[Math.max(0, Math.min(insertionPoints.length - 1, selectedIndex))];
  const theme = DECOY_THEMES[selectedIndex % DECOY_THEMES.length];
  const marker = hashText(`${context.normalizedSeed}:${asset.relativePath}:semantic:${selectedIndex}`);
  const objectName = `__p1_sem_${marker.slice(0, 6)}`;
  const aliasName = `__p1_alias_${marker.slice(0, 6)}`;

  const snippet = [
    "",
    "if (false) {",
    `  const ${objectName} = { ${theme.alias}: "${theme.value}", hint: "${marker}" };`,
    `  const ${aliasName} = ${objectName}.${theme.alias} + ":" + ${objectName}.hint;`,
    `  void ${aliasName};`,
    "}",
    ""
  ].join("\n");

  return {
    code: `${code.slice(0, insertionPoint)}${snippet}${code.slice(insertionPoint)}`,
    diagnostics: [
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.jsSemanticNoiseApplied,
        asset.relativePath,
        `inserted-index-${selectedIndex}`
      )
    ]
  };
}
