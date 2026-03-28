import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obfuscate } from "../src/api";

describe("milestones M0/M1", () => {
  it("M0: parser round-trip works and run artifacts are written", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-m0-"));
    const inputDir = path.join(tempRoot, "in");
    const outDir = "out";

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "sample.html"), "<div>ok</div>\r\n", "utf8");
    await fs.writeFile(path.join(inputDir, "sample.css"), "#a { color: red; }\r\n", "utf8");
    await fs.writeFile(path.join(inputDir, "sample.js"), "const value = 1;\r\n", "utf8");

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir,
        minify: false,
        pass1: {
          enabled: false,
          js: {
            renameLocals: true,
            stringEncoding: "base64",
            controlFlowFlattening: "safe",
            deadCodeInjection: false
          },
          css: {
            renameClasses: true,
            renameIds: true,
            renameCustomProperties: true
          },
          html: {
            rewriteInlineScripts: true,
            rewriteInlineStyles: true
          }
        },
        pass2: {
          enabled: false,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        }
      }
    });

    const htmlOut = await fs.readFile(path.join(tempRoot, outDir, "in", "sample.html"), "utf8");
    const cssOut = await fs.readFile(path.join(tempRoot, outDir, "in", "sample.css"), "utf8");
    const jsOut = await fs.readFile(path.join(tempRoot, outDir, "in", "sample.js"), "utf8");

    expect(htmlOut).toBe("<div>ok</div>\n");
    expect(cssOut).toBe("#a { color: red; }\n");
    expect(jsOut).toBe("const value = 1;\n");

    expect(result.report.diagnostics).toEqual([]);
    await expect(fs.stat(path.join(tempRoot, outDir, "run-manifest.json"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(tempRoot, outDir, "transform-ledger.json"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(tempRoot, outDir, "diagnostics.json"))).resolves.toBeDefined();
  });

  it("M1: run processes HTML/CSS/JS fixture set and emits source maps", async () => {
    const root = path.resolve("tests", "fixtures", "site");
    const outDir = path.resolve(".vitest-temp", "m1-out");

    await fs.rm(outDir, { recursive: true, force: true });

    const result = await obfuscate({
      config: {
        root,
        inputs: ["."],
        outDir,
        seed: "m1-seed",
        sourceMaps: true
      }
    });

    expect(result.filesProcessed).toBe(4);
    expect(result.report.diagnostics).toEqual([]);

    await expect(fs.stat(path.join(outDir, "index.html"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(outDir, "styles.css"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(outDir, "app.js"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(outDir, "util.js"))).resolves.toBeDefined();

    await expect(fs.stat(path.join(outDir, "styles.css.map"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(outDir, "app.js.map"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(outDir, "util.js.map"))).resolves.toBeDefined();

    await expect(fs.stat(path.join(outDir, "run-manifest.json"))).resolves.toBeDefined();
  });
});
