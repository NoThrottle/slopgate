import { describe, expect, it } from "vitest";
import type { PipelineAsset } from "../src/core/types";
import { checkGraphIntegrity } from "../src/graph/ref-tracker";
import { buildSymbolGraph } from "../src/graph/symbol-graph";

describe("ref tracker robustness", () => {
  it("ignores import-like content inside JS comments and strings", () => {
    const assets: PipelineAsset[] = [
      {
        filePath: "src/main.js",
        relativePath: "src/main.js",
        type: "js",
        code: [
          "// import './missing-comment.js'",
          "const note = \"import './missing-string.js'\";",
          "import './dep.js';"
        ].join("\n")
      },
      {
        filePath: "src/dep.js",
        relativePath: "src/dep.js",
        type: "js",
        code: "export const dep = 1;"
      }
    ];

    const graph = buildSymbolGraph(assets);
    expect(checkGraphIntegrity(graph, assets)).toEqual([]);
  });

  it("normalizes HTML references with query/hash suffixes", () => {
    const assets: PipelineAsset[] = [
      {
        filePath: "site/index.html",
        relativePath: "site/index.html",
        type: "html",
        code: [
          "<html>",
          "  <head><link rel=\"stylesheet\" href=\"./styles.css?v=42#main\"></head>",
          "  <body><script src=\"./app.js?cache=1\"></script></body>",
          "</html>"
        ].join("\n")
      },
      {
        filePath: "site/app.js",
        relativePath: "site/app.js",
        type: "js",
        code: "console.log('ok');"
      },
      {
        filePath: "site/styles.css",
        relativePath: "site/styles.css",
        type: "css",
        code: "body { color: black; }"
      }
    ];

    const graph = buildSymbolGraph(assets);
    expect(checkGraphIntegrity(graph, assets)).toEqual([]);
  });

  it("extracts stable cross-asset selector links for supported static forms", () => {
    const assets: PipelineAsset[] = [
      {
        filePath: "site/index.html",
        relativePath: "site/index.html",
        type: "html",
        code: '<main id="app" class="shell shell-secondary"></main>'
      },
      {
        filePath: "site/styles.css",
        relativePath: "site/styles.css",
        type: "css",
        code: "#app.shell, .shell-secondary { color: black; }"
      },
      {
        filePath: "site/app.js",
        relativePath: "site/app.js",
        type: "js",
        code: [
          "document.getElementById('app');",
          "document.getElementsByClassName('shell');",
          "document.querySelector('.shell-secondary');",
          "document.querySelectorAll('#app');"
        ].join("\n")
      }
    ];

    const graph = buildSymbolGraph(assets);
    expect(graph.crossAssetDiagnostics).toEqual([]);
    expect(graph.selectorRefsByFile["site/app.js"].map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "id:app",
      "class:shell",
      "class:shell-secondary"
    ]);
    expect(graph.selectorRefsByFile["site/index.html"].map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "id:app",
      "class:shell",
      "class:shell-secondary"
    ]);
    expect(graph.selectorRefsByFile["site/styles.css"].map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "id:app",
      "class:shell",
      "class:shell-secondary"
    ]);
  });

  it("surfaces unsupported selector forms as diagnostics", () => {
    const assets: PipelineAsset[] = [
      {
        filePath: "site/app.js",
        relativePath: "site/app.js",
        type: "js",
        code: [
          "const suffix = 'shell';",
          "document.querySelector('.shell .child');",
          "document.querySelector(`#${suffix}`);"
        ].join("\n")
      }
    ];

    const graph = buildSymbolGraph(assets);
    expect(graph.crossAssetDiagnostics.length).toBeGreaterThan(0);
    expect(graph.crossAssetDiagnostics.every((entry) => entry.includes("PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR"))).toBe(
      true
    );
  });

  it("ignores selector-like class/id text inside HTML script/style/comment blocks", () => {
    const assets: PipelineAsset[] = [
      {
        filePath: "site/index.html",
        relativePath: "site/index.html",
        type: "html",
        code: [
          "<html>",
          "  <body>",
          "    <!-- <div id=\"comment-id\" class=\"comment-class\"></div> -->",
          "    <script>",
          "      const markup = '<div id=\"script-id\" class=\"script-class\"></div>';",
          "    </script>",
          "    <style>",
          "      .style-class#style-id { color: red; }",
          "    </style>",
          "    <main id=\"app\" class=\"shell\">ok</main>",
          "  </body>",
          "</html>"
        ].join("\n")
      }
    ];

    const graph = buildSymbolGraph(assets);
    expect(graph.selectorRefsByFile["site/index.html"].map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "id:app",
      "class:shell"
    ]);
  });
});
