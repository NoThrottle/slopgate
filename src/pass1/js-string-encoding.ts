import type { PipelineAsset, PipelineContext } from "../core/types";
import { PASS1_DIAGNOSTIC_TAGS, createPass1Diagnostic } from "./pass1-diagnostics";

export interface JsPass1TransformResult {
  code: string;
  diagnostics: string[];
}

const UNSAFE_ESCAPE_PATTERN = /\\/;
const SIMPLE_STRING_PATTERN = /^[\x20-\x7E]*$/;

export function applyJsStringEncoding(
  asset: PipelineAsset,
  context: PipelineContext
): JsPass1TransformResult {
  if (!context.config.pass1.enabled || !context.config.minify) {
    return { code: asset.code, diagnostics: [] };
  }

  if (context.config.pass1.js.stringEncoding !== "base64") {
    return { code: asset.code, diagnostics: [] };
  }

  const diagnostics: string[] = [];
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  const directiveRanges = collectDirectiveRanges(asset.code);

  const interpolationTemplatePattern = /`[^`]*\$\{[^}]+\}[^`]*`/g;
  for (const match of asset.code.matchAll(interpolationTemplatePattern)) {
    diagnostics.push(
      createPass1Diagnostic(
        PASS1_DIAGNOSTIC_TAGS.jsStringEncodingUnsupported,
        asset.relativePath,
        `template-literal-with-interpolation @${match.index ?? 0}`
      )
    );
  }

  for (let index = 0; index < asset.code.length; index += 1) {
    const quote = asset.code[index];
    if (quote !== '"' && quote !== "'") {
      continue;
    }

    const literal = parseQuotedLiteral(asset.code, index);
    if (!literal) {
      continue;
    }

    index = literal.end - 1;
    const literalText = asset.code.slice(literal.start, literal.end);
    const reason = getSkipReason(asset.code, literal, directiveRanges);
    if (reason) {
      diagnostics.push(
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsStringEncodingUnsupported,
          asset.relativePath,
          `${reason} @${literal.start}`
        )
      );
      continue;
    }

    if (!SIMPLE_STRING_PATTERN.test(literal.value) || UNSAFE_ESCAPE_PATTERN.test(literalText)) {
      diagnostics.push(
        createPass1Diagnostic(
          PASS1_DIAGNOSTIC_TAGS.jsStringEncodingUnsupported,
          asset.relativePath,
          `ambiguous-escaped-or-non-ascii-literal @${literal.start}`
        )
      );
      continue;
    }

    const encoded = encodeAsHexEscapes(literal.value, quote);
    replacements.push({
      start: literal.start,
      end: literal.end,
      replacement: encoded
    });
  }

  let output = asset.code;
  for (let replacementIndex = replacements.length - 1; replacementIndex >= 0; replacementIndex -= 1) {
    const replacement = replacements[replacementIndex];
    output = `${output.slice(0, replacement.start)}${replacement.replacement}${output.slice(replacement.end)}`;
  }

  diagnostics.sort((left, right) => left.localeCompare(right));
  return {
    code: output,
    diagnostics
  };
}

interface QuotedLiteral {
  start: number;
  end: number;
  value: string;
}

function parseQuotedLiteral(code: string, start: number): QuotedLiteral | null {
  const quote = code[start];
  let value = "";
  for (let index = start + 1; index < code.length; index += 1) {
    const char = code[index];
    if (char === "\\") {
      const next = code[index + 1] ?? "";
      value += `${char}${next}`;
      index += 1;
      continue;
    }
    if (char === quote) {
      return {
        start,
        end: index + 1,
        value
      };
    }
    if (char === "\n" || char === "\r") {
      return null;
    }
    value += char;
  }
  return null;
}

function encodeAsHexEscapes(value: string, quote: string): string {
  const escaped = [...value]
    .map((char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");
  return `${quote}${escaped}${quote}`;
}

function getSkipReason(
  code: string,
  literal: QuotedLiteral,
  directiveRanges: Array<{ start: number; end: number }>
): string | null {
  if (directiveRanges.some((range) => literal.start >= range.start && literal.end <= range.end)) {
    return "directive-prologue-literal";
  }

  const before = code.slice(Math.max(0, literal.start - 64), literal.start);
  const after = code.slice(literal.end, Math.min(code.length, literal.end + 64));

  if (/\bfrom\s*$/.test(before) || /\bimport\s*\($/.test(before) || /^\s*\)/.test(after)) {
    return "module-specifier-literal";
  }

  if (/\bimport\s*$/.test(before) || /^\s*;/.test(after)) {
    const statementStart = code.lastIndexOf("\n", literal.start - 1) + 1;
    const statementPrefix = code.slice(statementStart, literal.start);
    if (/^\s*import\s*$/.test(statementPrefix)) {
      return "module-specifier-literal";
    }
  }

  if (isObjectKeyLiteral(code, literal)) {
    return "object-key-or-structural-literal";
  }

  return null;
}

function isObjectKeyLiteral(code: string, literal: QuotedLiteral): boolean {
  let lookaheadIndex = literal.end;
  while (lookaheadIndex < code.length && /\s/.test(code[lookaheadIndex])) {
    lookaheadIndex += 1;
  }
  if (code[lookaheadIndex] !== ":") {
    return false;
  }

  let lookbehindIndex = literal.start - 1;
  while (lookbehindIndex >= 0 && /\s/.test(code[lookbehindIndex])) {
    lookbehindIndex -= 1;
  }

  return lookbehindIndex < 0 || code[lookbehindIndex] === "{" || code[lookbehindIndex] === ",";
}

function collectDirectiveRanges(code: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let index = 0;

  while (index < code.length) {
    while (index < code.length && /[\s;]/.test(code[index])) {
      index += 1;
    }
    if (index >= code.length) {
      break;
    }

    const quote = code[index];
    if (quote !== '"' && quote !== "'") {
      break;
    }

    const literal = parseQuotedLiteral(code, index);
    if (!literal) {
      break;
    }

    let cursor = literal.end;
    while (cursor < code.length && /\s/.test(code[cursor])) {
      cursor += 1;
    }
    if (code[cursor] === ";") {
      cursor += 1;
    }

    ranges.push({ start: literal.start, end: literal.end });
    index = cursor;
  }

  return ranges;
}
