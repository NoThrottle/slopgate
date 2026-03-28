import type { PipelineAsset } from "../core/types";

export type SelectorKind = "class" | "id";

export interface SelectorReference {
  file: string;
  assetType: PipelineAsset["type"];
  kind: SelectorKind;
  name: string;
  index: number;
}

export interface CrossAssetExtractionResult {
  refsByFile: Record<string, SelectorReference[]>;
  diagnostics: string[];
}

interface UnsupportedSelectorDiagnostic {
  tag: "PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR";
  file: string;
  source: string;
}

export function extractCrossAssetLinks(assets: PipelineAsset[]): CrossAssetExtractionResult {
  const refsByFile: Record<string, SelectorReference[]> = {};
  const unsupportedDiagnostics: UnsupportedSelectorDiagnostic[] = [];

  for (const asset of assets) {
    const refs: SelectorReference[] = [];
    if (asset.type === "css") {
      refs.push(...extractCssSelectorReferences(asset));
    } else if (asset.type === "html") {
      refs.push(...extractHtmlSelectorReferences(asset));
    } else if (asset.type === "js") {
      const js = extractJsSelectorReferences(asset);
      refs.push(...js.refs);
      unsupportedDiagnostics.push(...js.diagnostics);
    }

    refsByFile[asset.relativePath] = dedupeAndSortSelectorRefs(refs);
  }

  const diagnostics = dedupeAndSortUnsupportedDiagnostics(unsupportedDiagnostics);

  return {
    refsByFile,
    diagnostics
  };
}

function extractCssSelectorReferences(asset: PipelineAsset): SelectorReference[] {
  const refs: SelectorReference[] = [];
  const selectorPreludePattern = /([^{}]+)\{/g;

  for (const match of asset.code.matchAll(selectorPreludePattern)) {
    const prelude = match[1] ?? "";
    const preludeStart = match.index ?? 0;
    const selectorTokenPattern = /([.#])([A-Za-z_][A-Za-z0-9_-]*)/g;
    for (const token of prelude.matchAll(selectorTokenPattern)) {
      const marker = token[1] ?? "";
      const name = token[2] ?? "";
      const tokenOffset = token.index ?? 0;
      if (!name) {
        continue;
      }
      refs.push({
        file: asset.relativePath,
        assetType: asset.type,
        kind: marker === "." ? "class" : "id",
        name,
        index: preludeStart + tokenOffset
      });
    }
  }

  return refs;
}

function extractHtmlSelectorReferences(asset: PipelineAsset): SelectorReference[] {
  const refs: SelectorReference[] = [];
  const maskedCode = maskHtmlProtectedRegions(asset.code);

  const classAttrPattern = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (const match of maskedCode.matchAll(classAttrPattern)) {
    const fullMatch = match[0] ?? "";
    const attrValue = match[2] ?? match[3] ?? "";
    const attrIndex = match.index ?? 0;
    const valueOffsetInMatch = fullMatch.indexOf(attrValue);
    const valueStart = attrIndex + Math.max(0, valueOffsetInMatch);
    let searchOffset = 0;
    for (const token of attrValue.split(/\s+/).filter((entry) => entry.length > 0)) {
      const tokenIndex = attrValue.indexOf(token, searchOffset);
      searchOffset = tokenIndex + token.length;
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
        continue;
      }
      refs.push({
        file: asset.relativePath,
        assetType: asset.type,
        kind: "class",
        name: token,
        index: valueStart + tokenIndex
      });
    }
  }

  const idAttrPattern = /\bid\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (const match of maskedCode.matchAll(idAttrPattern)) {
    const fullMatch = match[0] ?? "";
    const attrValue = (match[2] ?? match[3] ?? "").trim();
    const valueOffsetInMatch = fullMatch.indexOf(match[2] ?? match[3] ?? "");
    const valueStart = (match.index ?? 0) + Math.max(0, valueOffsetInMatch);
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(attrValue)) {
      continue;
    }
    refs.push({
      file: asset.relativePath,
      assetType: asset.type,
      kind: "id",
      name: attrValue,
      index: valueStart
    });
  }

  return refs;
}

function maskHtmlProtectedRegions(code: string): string {
  const chars = code.split("");
  const protectedPattern = /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi;

  for (const match of code.matchAll(protectedPattern)) {
    const start = match.index ?? 0;
    const text = match[0] ?? "";
    const end = start + text.length;
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== "\n") {
        chars[index] = " ";
      }
    }
  }

  return chars.join("");
}

function extractJsSelectorReferences(asset: PipelineAsset): {
  refs: SelectorReference[];
  diagnostics: UnsupportedSelectorDiagnostic[];
} {
  const refs: SelectorReference[] = [];
  const diagnostics: UnsupportedSelectorDiagnostic[] = [];
  const callPattern = /\bdocument\s*\.\s*(getElementById|getElementsByClassName|querySelector|querySelectorAll)\s*\(([^)]*)\)/g;

  for (const match of asset.code.matchAll(callPattern)) {
    const api = match[1] ?? "";
    const rawArg = (match[2] ?? "").trim();
    const callText = (match[0] ?? "").trim();
    const parsedArg = parseStaticStringArg(rawArg);

    if (api === "getElementById") {
      if (!parsedArg || !isSelectorName(parsedArg.value)) {
        diagnostics.push({
          tag: "PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR",
          file: asset.relativePath,
          source: callText
        });
        continue;
      }
      refs.push({
        file: asset.relativePath,
        assetType: asset.type,
        kind: "id",
        name: parsedArg.value,
        index: (match.index ?? 0) + parsedArg.offset
      });
      continue;
    }

    if (api === "getElementsByClassName") {
      if (!parsedArg || !isSelectorName(parsedArg.value)) {
        diagnostics.push({
          tag: "PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR",
          file: asset.relativePath,
          source: callText
        });
        continue;
      }
      refs.push({
        file: asset.relativePath,
        assetType: asset.type,
        kind: "class",
        name: parsedArg.value,
        index: (match.index ?? 0) + parsedArg.offset
      });
      continue;
    }

    if (!parsedArg) {
      diagnostics.push({
        tag: "PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR",
        file: asset.relativePath,
        source: callText
      });
      continue;
    }

    const simpleSelector = parseSimpleDocumentSelector(parsedArg.value);
    if (!simpleSelector) {
      diagnostics.push({
        tag: "PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR",
        file: asset.relativePath,
        source: callText
      });
      continue;
    }

    refs.push({
      file: asset.relativePath,
      assetType: asset.type,
      kind: simpleSelector.kind,
      name: simpleSelector.name,
      index: (match.index ?? 0) + parsedArg.offset
    });
  }

  return {
    refs,
    diagnostics
  };
}

function parseStaticStringArg(raw: string): { value: string; offset: number } | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'" && quote !== "`") || trimmed[trimmed.length - 1] !== quote) {
    return null;
  }

  const inner = trimmed.slice(1, -1);
  if (quote === "`" && inner.includes("${")) {
    return null;
  }

  if (inner.includes("\\")) {
    return null;
  }

  return {
    value: inner,
    offset: raw.indexOf(trimmed) + 1
  };
}

function parseSimpleDocumentSelector(selector: string): { kind: SelectorKind; name: string } | null {
  const trimmed = selector.trim();
  if (trimmed.length < 2) {
    return null;
  }
  if (/[\s,>+~:[\]()]/.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith(".")) {
    const name = trimmed.slice(1);
    if (!isSelectorName(name)) {
      return null;
    }
    return { kind: "class", name };
  }

  if (trimmed.startsWith("#")) {
    const name = trimmed.slice(1);
    if (!isSelectorName(name)) {
      return null;
    }
    return { kind: "id", name };
  }

  return null;
}

function isSelectorName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value);
}

function dedupeAndSortSelectorRefs(refs: SelectorReference[]): SelectorReference[] {
  const map = new Map<string, SelectorReference>();
  for (const ref of refs) {
    const key = `${ref.file}\u0000${ref.assetType}\u0000${ref.kind}\u0000${ref.name}`;
    if (!map.has(key) || (map.get(key)?.index ?? Number.MAX_SAFE_INTEGER) > ref.index) {
      map.set(key, ref);
    }
  }

  return [...map.values()].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.index - right.index ||
      left.kind.localeCompare(right.kind) ||
      left.name.localeCompare(right.name)
  );
}

function dedupeAndSortUnsupportedDiagnostics(diagnostics: UnsupportedSelectorDiagnostic[]): string[] {
  const seen = new Set<string>();
  const unique = diagnostics.filter((entry) => {
    const key = `${entry.tag}\u0000${entry.file}\u0000${entry.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  unique.sort(
    (left, right) =>
      left.tag.localeCompare(right.tag) || left.file.localeCompare(right.file) || left.source.localeCompare(right.source)
  );

  return unique.map((entry) => `[${entry.tag}] ${entry.file} :: ${entry.source}`);
}
