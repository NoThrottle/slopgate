import type { SelectorKind } from "../graph/cross-asset-links";
import type { SelectorRenameMap } from "./rewrite-css";

export function rewriteHtmlSelectors(code: string, mapping: SelectorRenameMap): string {
  const protectedRanges = collectProtectedHtmlRanges(code);

  const withIds = code.replace(/(\bid\s*=\s*)(["'])([^"']*)(["'])/gi, (full, prefix: string, open: string, value: string, close: string, offset: number) => {
    if (isInProtectedRange(offset, protectedRanges)) {
      return full;
    }
    if (open !== close) {
      return full;
    }
    const replacement = mapping.id.get(value.trim());
    if (!replacement) {
      return full;
    }
    return `${prefix}${open}${replacement}${close}`;
  });

  return withIds.replace(/(\bclass\s*=\s*)(["'])([^"']*)(["'])/gi, (full, prefix: string, open: string, value: string, close: string, offset: number) => {
    if (isInProtectedRange(offset, protectedRanges)) {
      return full;
    }
    if (open !== close) {
      return full;
    }

    const rewritten = value
      .split(/(\s+)/)
      .map((token: string) => {
        if (!token || /^\s+$/.test(token)) {
          return token;
        }
        return mapping.class.get(token) ?? token;
      })
      .join("");

    return `${prefix}${open}${rewritten}${close}`;
  });
}

function collectProtectedHtmlRanges(code: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const protectedPattern = /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi;

  for (const match of code.matchAll(protectedPattern)) {
    const start = match.index ?? 0;
    ranges.push({
      start,
      end: start + (match[0] ?? "").length
    });
  }

  return ranges;
}

function isInProtectedRange(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

export type { SelectorRenameMap, SelectorKind };
