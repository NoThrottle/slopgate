import { describe, expect, it } from "vitest";
import { buildSourceMapPlaceholders, verifySourceMapConsistency } from "../src/emit/sourcemap";
import type { PipelineAsset } from "../src/core/types";

function createAsset(relativePath: string, type: PipelineAsset["type"]): PipelineAsset {
  return {
    filePath: relativePath,
    relativePath,
    type,
    code: ""
  };
}

describe("source-map verification", () => {
  it("builds valid JS/CSS maps and emits no sourcemap diagnostics for baseline", () => {
    const assets: PipelineAsset[] = [
      createAsset("site/app.js", "js"),
      createAsset("site/styles.css", "css"),
      createAsset("site/index.html", "html")
    ];

    const maps = buildSourceMapPlaceholders(assets);

    expect(Object.keys(maps).sort()).toEqual(["site/app.js", "site/styles.css"]);
    expect(verifySourceMapConsistency(assets, maps, true)).toEqual([]);

    const appMap = JSON.parse(maps["site/app.js"]);
    expect(appMap).toEqual({
      version: 3,
      file: "app.js",
      sources: ["site/app.js"],
      names: [],
      mappings: ";"
    });
  });

  it("emits deterministic file linkage diagnostics for mismatch and orphan maps", () => {
    const assets: PipelineAsset[] = [createAsset("site/app.js", "js")];
    const maps = buildSourceMapPlaceholders(assets);

    maps["site/app.js"] = JSON.stringify({
      version: 3,
      file: "wrong.js",
      sources: ["site/app.js"],
      names: [],
      mappings: ";"
    });
    maps["site/orphan.js"] = JSON.stringify({
      version: 3,
      file: "orphan.js",
      sources: ["site/orphan.js"],
      names: [],
      mappings: ";"
    });

    expect(verifySourceMapConsistency(assets, maps, false)).toEqual([
      "[SOURCEMAP_FILE_MISMATCH] Source map 'site/app.js.map' links to 'wrong.js' (expected 'app.js')",
      "[SOURCEMAP_FILE_MISMATCH] Source map 'site/orphan.js.map' does not match any emitted JS/CSS asset"
    ]);
  });

  it("emits missing metadata diagnostics and strict-only empty mappings diagnostic", () => {
    const assets: PipelineAsset[] = [createAsset("site/app.js", "js")];

    const mapsMissingMetadata: Record<string, string> = {
      "site/app.js": JSON.stringify({ version: 3, file: "app.js" })
    };

    expect(verifySourceMapConsistency(assets, mapsMissingMetadata, false)).toEqual([
      "[SOURCEMAP_SOURCES_MISSING] Source map 'site/app.js.map' is missing non-empty 'sources'",
      "[SOURCEMAP_NAMES_MISSING] Source map 'site/app.js.map' is missing 'names' array",
      "[SOURCEMAP_MAPPINGS_MISSING] Source map 'site/app.js.map' is missing 'mappings'"
    ]);

    const mapsEmptyMappings: Record<string, string> = {
      "site/app.js": JSON.stringify({
        version: 3,
        file: "app.js",
        sources: ["site/app.js"],
        names: [],
        mappings: ""
      })
    };

    expect(verifySourceMapConsistency(assets, mapsEmptyMappings, false)).toEqual([]);
    expect(verifySourceMapConsistency(assets, mapsEmptyMappings, true)).toEqual([
      "[SOURCEMAP_MAPPINGS_EMPTY] Source map 'site/app.js.map' has empty 'mappings' in strict mode"
    ]);
  });
});
