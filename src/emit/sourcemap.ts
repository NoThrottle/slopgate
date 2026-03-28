import fs from "node:fs/promises";
import path from "node:path";
import type { ObfuscatorConfig } from "../api/types";
import type { PipelineAsset } from "../core/types";

interface SourceMapRecord {
  version?: number;
  file?: string;
  sources?: unknown;
  names?: unknown;
  mappings?: unknown;
}

const SUPPORTED_SOURCE_MAP_VERSION = 3;

export function buildSourceMapPlaceholders(assets: PipelineAsset[]): Record<string, string> {
  const maps: Record<string, string> = {};
  for (const asset of assets.filter((entry) => entry.type === "js" || entry.type === "css")) {
    const normalizedRelativePath = normalizeRelativePath(asset.relativePath);
    const sourceMap: SourceMapRecord = {
      version: SUPPORTED_SOURCE_MAP_VERSION,
      file: path.posix.basename(normalizedRelativePath),
      sources: [normalizedRelativePath],
      names: [],
      // Placeholder mapping remains non-semantic for this phase but must be present.
      mappings: ";"
    };
    maps[normalizedRelativePath] = stableStringifySourceMap(sourceMap);
  }
  return maps;
}

export function verifySourceMapConsistency(
  assets: PipelineAsset[],
  maps: Record<string, string>,
  strictMode: boolean
): string[] {
  const diagnostics: string[] = [];
  const eligibleAssets = assets
    .filter((entry) => entry.type === "js" || entry.type === "css")
    .map((entry) => normalizeRelativePath(entry.relativePath))
    .sort();
  const eligibleSet = new Set(eligibleAssets);

  for (const relativePath of eligibleAssets) {
    const mapContent = maps[relativePath];
    const mapFile = `${relativePath}.map`;
    if (!mapContent) {
      diagnostics.push(
        `[SOURCEMAP_FILE_MISMATCH] Missing source map for emitted asset '${relativePath}' (expected '${mapFile}')`
      );
      continue;
    }

    const parsed = parseSourceMapRecord(mapContent);
    if (parsed === null) {
      diagnostics.push(`[SOURCEMAP_FILE_MISMATCH] Invalid JSON in source map '${mapFile}'`);
      continue;
    }

    const expectedFileName = path.posix.basename(relativePath);
    if (parsed.version !== SUPPORTED_SOURCE_MAP_VERSION) {
      diagnostics.push(
        `[SOURCEMAP_INVALID_VERSION] Source map '${mapFile}' has unsupported version '${String(parsed.version)}' (expected '${SUPPORTED_SOURCE_MAP_VERSION}')`
      );
    }

    if (parsed.file !== expectedFileName) {
      diagnostics.push(
        `[SOURCEMAP_FILE_MISMATCH] Source map '${mapFile}' links to '${String(parsed.file)}' (expected '${expectedFileName}')`
      );
    }

    if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      diagnostics.push(`[SOURCEMAP_SOURCES_MISSING] Source map '${mapFile}' is missing non-empty 'sources'`);
    }

    if (!Array.isArray(parsed.names)) {
      diagnostics.push(`[SOURCEMAP_NAMES_MISSING] Source map '${mapFile}' is missing 'names' array`);
    }

    if (!("mappings" in parsed)) {
      diagnostics.push(`[SOURCEMAP_MAPPINGS_MISSING] Source map '${mapFile}' is missing 'mappings'`);
    } else if (strictMode && parsed.mappings === "") {
      diagnostics.push(`[SOURCEMAP_MAPPINGS_EMPTY] Source map '${mapFile}' has empty 'mappings' in strict mode`);
    }
  }

  for (const mapRelativePath of Object.keys(maps).map(normalizeRelativePath).sort()) {
    if (!eligibleSet.has(mapRelativePath)) {
      diagnostics.push(
        `[SOURCEMAP_FILE_MISMATCH] Source map '${mapRelativePath}.map' does not match any emitted JS/CSS asset`
      );
    }
  }

  return diagnostics;
}

export async function writeSourceMapFiles(
  config: ObfuscatorConfig,
  maps: Record<string, string>
): Promise<string[]> {
  const outRoot = path.resolve(config.root, config.outDir);
  const outputFiles: string[] = [];
  for (const relativePath of Object.keys(maps).sort()) {
    const mapContent = maps[relativePath];
    const mapPath = path.resolve(outRoot, `${relativePath}.map`);
    await fs.mkdir(path.dirname(mapPath), { recursive: true });
    await fs.writeFile(mapPath, mapContent, "utf8");
    outputFiles.push(mapPath);
  }
  return outputFiles;
}

function stableStringifySourceMap(record: SourceMapRecord): string {
  return JSON.stringify({
    version: record.version,
    file: record.file,
    sources: record.sources,
    names: record.names,
    mappings: record.mappings
  });
}

function parseSourceMapRecord(content: string): SourceMapRecord | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as SourceMapRecord;
  } catch {
    return null;
  }
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}