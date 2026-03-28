import { createPrng, hashText } from "../core/seed";
import type { PipelineAsset, PipelineContext } from "../core/types";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";
import type { JsPass1TransformResult } from "./js-string-encoding";

export function applyJsDeadCodeInjection(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): JsPass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify || !context.config.pass1.js.deadCodeInjection) {
    return { code, diagnostics: [] };
  }

  const insertionPoints = collectInsertionPoints(code);
  if (insertionPoints.length === 0) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsDeadCodeSkipped,
          asset.relativePath,
          "no-safe-insertion-point"
        )
      ]
    };
  }

  const prng = createPrng(`${context.normalizedSeed}:${asset.relativePath}:pass1-dead-code`);
  const selectedIndex = Math.floor(prng() * insertionPoints.length);
  const insertionPoint = insertionPoints[Math.max(0, Math.min(insertionPoints.length - 1, selectedIndex))];
  const marker = hashText(`${context.normalizedSeed}:${asset.relativePath}:${selectedIndex}`);
  const deadName = `__p1_dead_${marker.slice(0, 6)}`;
  const snippet = [
    "",
    "if (false) {",
    `  const ${deadName} = "${marker}";`,
    `  void ${deadName};`,
    "}",
    ""
  ].join("\n");

  return {
    code: `${code.slice(0, insertionPoint)}${snippet}${code.slice(insertionPoint)}`,
    diagnostics: []
  };
}

export function applyJsNoopNestingNoise(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): JsPass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify || context.config.pass1.js.noopNestingNoise !== "safe") {
    return { code, diagnostics: [] };
  }

  const insertionPoints = collectInsertionPoints(code);
  if (insertionPoints.length === 0) {
    return {
      code,
      diagnostics: [
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsNoopNestingSkipped,
          asset.relativePath,
          "no-safe-insertion-point"
        )
      ]
    };
  }

  const prng = createPrng(`${context.normalizedSeed}:${asset.relativePath}:pass1-noop-nesting`);
  const selectedIndex = Math.floor(prng() * insertionPoints.length);
  const insertionPoint = insertionPoints[Math.max(0, Math.min(insertionPoints.length - 1, selectedIndex))];
  const marker = hashText(`${context.normalizedSeed}:${asset.relativePath}:noop:${selectedIndex}`);
  const deadName = `__p1_noop_${marker.slice(0, 6)}`;
  const snippet = [
    "",
    "{",
    "  if (true) {",
    "    if (false) {",
    `      const ${deadName} = ${selectedIndex};`,
    `      void ${deadName};`,
    "    }",
    "  }",
    "}",
    ""
  ].join("\n");

  return {
    code: `${code.slice(0, insertionPoint)}${snippet}${code.slice(insertionPoint)}`,
    diagnostics: [
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.jsNoopNestingApplied,
        asset.relativePath,
        `inserted-index-${selectedIndex}`
      )
    ]
  };
}

export function collectInsertionPoints(code: string): number[] {
  const points = new Set<number>();
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateLiteral = false;
  let inLineComment = false;
  let inBlockComment = false;

  const canInsertAtBoundary = (): boolean => parenDepth === 0 && braceDepth === 0 && bracketDepth === 0;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index] ?? "";
    const next = code[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        if (canInsertAtBoundary()) {
          points.add(index + 1);
        }
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplateLiteral) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === "`") {
        inTemplateLiteral = false;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      inTemplateLiteral = true;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if ((char === ";" || char === "\n") && canInsertAtBoundary()) {
      points.add(index + 1);
    }
  }

  if (code.endsWith("\n") && canInsertAtBoundary()) {
    points.add(code.length);
  }

  return [...points].sort((left, right) => left - right);
}
