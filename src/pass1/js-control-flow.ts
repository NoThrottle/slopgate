import type { PipelineAsset, PipelineContext } from "../core/types";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";
import type { JsPass1TransformResult } from "./js-string-encoding";

const SIMPLE_IF_ELSE_PATTERN = /if\s*\(([^(){}]*)\)\s*\{([^{}]*)\}\s*else\s*\{([^{}]*)\}/g;
const UNSUPPORTED_FLOW_PATTERN = /\b(?:try|catch|finally|break|continue|for|while|do|switch|yield|await)\b|[A-Za-z_$][\w$]*\s*:/;

export function applyJsControlFlowFlattening(
  asset: PipelineAsset,
  context: PipelineContext,
  code: string
): JsPass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify) {
    return { code, diagnostics: [] };
  }

  if (context.config.pass1.js.controlFlowFlattening !== "safe") {
    return { code, diagnostics: [] };
  }

  const diagnostics: string[] = [];
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  let flattenCounter = 0;
  const searchableCode = maskProtectedSegments(code);

  for (const match of searchableCode.matchAll(SIMPLE_IF_ELSE_PATTERN)) {
    const full = match[0] ?? "";
    const condition = (match[1] ?? "").trim();
    const consequent = (match[2] ?? "").trim();
    const alternate = (match[3] ?? "").trim();
    const start = match.index ?? -1;
    const end = start + full.length;

    if (start < 0) {
      continue;
    }

    const reason = getUnsupportedReason(condition, consequent, alternate);
    if (reason) {
      diagnostics.push(
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsControlFlowUnsupported,
          asset.relativePath,
          `${reason} @${start}`
        )
      );
      continue;
    }

    const stateName = `__p1_cf_${flattenCounter.toString(10)}`;
    const flattened = [
      "{",
      `const ${stateName} = (${condition}) ? 0 : 1;`,
      `switch (${stateName}) {`,
      `case 0: { ${consequent}; break; }`,
      `default: { ${alternate}; break; }`,
      "}",
      "}"
    ].join(" ");

    replacements.push({ start, end, replacement: flattened });
    flattenCounter += 1;
  }

  if (replacements.length === 0 && UNSUPPORTED_FLOW_PATTERN.test(code)) {
    diagnostics.push(
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.jsControlFlowUnsupported,
        asset.relativePath,
        "file-contains-unsupported-control-flow"
      )
    );
  }

  let output = code;
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    output = `${output.slice(0, replacement.start)}${replacement.replacement}${output.slice(replacement.end)}`;
  }

  diagnostics.sort((left, right) => left.localeCompare(right));
  return {
    code: output,
    diagnostics
  };
}

function maskProtectedSegments(code: string): string {
  const masked = code.split("");
  let index = 0;

  while (index < code.length) {
    const current = code[index] ?? "";
    const next = code[index + 1] ?? "";

    if (current === "'" || current === '"') {
      const end = consumeQuoted(code, index, current);
      for (let cursor = index; cursor < end; cursor += 1) {
        if (masked[cursor] !== "\n" && masked[cursor] !== "\r") {
          masked[cursor] = " ";
        }
      }
      index = end;
      continue;
    }

    if (current === "`") {
      const end = consumeTemplateLiteral(code, index);
      for (let cursor = index; cursor < end; cursor += 1) {
        if (masked[cursor] !== "\n" && masked[cursor] !== "\r") {
          masked[cursor] = " ";
        }
      }
      index = end;
      continue;
    }

    if (current === "/" && next === "/") {
      let end = index + 2;
      while (end < code.length && code[end] !== "\n") {
        end += 1;
      }
      for (let cursor = index; cursor < end; cursor += 1) {
        masked[cursor] = " ";
      }
      index = end;
      continue;
    }

    if (current === "/" && next === "*") {
      let end = index + 2;
      while (end < code.length) {
        if (code[end] === "*" && (code[end + 1] ?? "") === "/") {
          end += 2;
          break;
        }
        end += 1;
      }
      for (let cursor = index; cursor < end; cursor += 1) {
        if (masked[cursor] !== "\n" && masked[cursor] !== "\r") {
          masked[cursor] = " ";
        }
      }
      index = end;
      continue;
    }

    index += 1;
  }

  return masked.join("");
}

function consumeQuoted(code: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < code.length) {
    const char = code[index] ?? "";
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    if (char === "\n" || char === "\r") {
      return index;
    }
    index += 1;
  }
  return code.length;
}

function consumeTemplateLiteral(code: string, start: number): number {
  let index = start + 1;
  while (index < code.length) {
    const char = code[index] ?? "";
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      return index + 1;
    }
    index += 1;
  }
  return code.length;
}

function getUnsupportedReason(condition: string, consequent: string, alternate: string): string | null {
  if (!condition || !consequent || !alternate) {
    return "empty-branch-or-condition";
  }

  const combined = `${condition};${consequent};${alternate}`;
  if (UNSUPPORTED_FLOW_PATTERN.test(combined)) {
    return "unsupported-control-flow-token";
  }

  if (/\b(?:return|throw|function|class|var)\b/.test(combined)) {
    return "unsupported-boundary-or-declaration";
  }

  if (/&&|\|\||\?/.test(condition)) {
    return "short-circuit-or-ternary-condition";
  }

  return null;
}
