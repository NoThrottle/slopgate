import path from "node:path";
import type { PipelineAsset } from "../core/types";
import type { SymbolGraph } from "./symbol-graph";

export function checkGraphIntegrity(graph: SymbolGraph, assets: PipelineAsset[]): string[] {
  const issues: string[] = [];
  for (const file of graph.files) {
    if (!(file in graph.identifiersByFile)) {
      issues.push(`[GRAPH_MISSING_SYMBOL_INDEX] Missing symbol index for file: ${file}`);
    }
  }
  issues.push(...findUnresolvedReferences(assets));
  return issues;
}

function findUnresolvedReferences(assets: PipelineAsset[]): string[] {
  const issues: string[] = [];
  const known = new Set(assets.map((asset) => normalizePath(asset.relativePath)));

  for (const asset of assets) {
    if (asset.type === "js") {
      for (const ref of extractJsRefs(asset.code)) {
        if (isExternalReference(ref)) {
          continue;
        }
        if (!resolveReference(asset.relativePath, ref, known)) {
          issues.push(`[GRAPH_UNRESOLVED_JS] Unresolved JS reference '${ref}' in ${asset.relativePath}`);
        }
      }
      continue;
    }

    if (asset.type === "html") {
      for (const ref of extractHtmlRefs(asset.code)) {
        if (isExternalReference(ref)) {
          continue;
        }
        if (!resolveReference(asset.relativePath, ref, known)) {
          issues.push(`[GRAPH_UNRESOLVED_HTML] Unresolved HTML reference '${ref}' in ${asset.relativePath}`);
        }
      }
    }
  }

  return issues;
}

function extractJsRefs(code: string): string[] {
  const refs: string[] = [];
  const sanitized = stripJsComments(code);
  const importExport = /^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/gm;
  const dynamicImport = /(^|[^\w$'"`])import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of sanitized.matchAll(importExport)) {
    refs.push(normalizeRefTarget(match[1]));
  }
  for (const match of sanitized.matchAll(dynamicImport)) {
    refs.push(normalizeRefTarget(match[2]));
  }
  return refs;
}

function extractHtmlRefs(code: string): string[] {
  const refs: string[] = [];
  const scriptSrc = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const styleHref = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

  for (const match of code.matchAll(scriptSrc)) {
    refs.push(normalizeRefTarget(match[1]));
  }
  for (const match of code.matchAll(styleHref)) {
    refs.push(normalizeRefTarget(match[1]));
  }
  return refs;
}

function resolveReference(fromPath: string, reference: string, known: Set<string>): boolean {
  const fromDir = path.posix.dirname(normalizePath(fromPath));
  const resolved = normalizePath(path.posix.normalize(path.posix.join(fromDir, reference)));
  const candidates = new Set<string>([
    resolved,
    `${resolved}.js`,
    `${resolved}.mjs`,
    `${resolved}.cjs`,
    `${resolved}.css`,
    `${resolved}.html`,
    `${resolved}.htm`,
    path.posix.join(resolved, "index.js"),
    path.posix.join(resolved, "index.css"),
    path.posix.join(resolved, "index.html")
  ]);

  for (const candidate of candidates) {
    if (known.has(candidate)) {
      return true;
    }
  }

  return false;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isExternalReference(ref: string): boolean {
  const normalizedRef = normalizeRefTarget(ref);
  return (
    normalizedRef.length === 0 ||
    normalizedRef.startsWith("#") ||
    normalizedRef.startsWith("data:") ||
    normalizedRef.startsWith("http://") ||
    normalizedRef.startsWith("https://") ||
    normalizedRef.startsWith("//")
  );
}

function normalizeRefTarget(ref: string): string {
  return ref.trim().replace(/[?#].*$/, "");
}

function stripJsComments(code: string): string {
  let output = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        output += "  ";
        index += 1;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}