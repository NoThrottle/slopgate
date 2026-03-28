import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obfuscate, verify } from "../src/api";

describe("determinism", () => {
  it("produces identical output for same seed and inputs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-1");
    const outTwo = path.join(tempRoot, "out-2");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const first = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outOne,
        seed: "same-seed",
        sourceMaps: true
      }
    });

    const second = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outTwo,
        seed: "same-seed",
        sourceMaps: true
      }
    });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");
    const firstMap = await fs.readFile(path.join(outOne, "in", "tiny.js.map"), "utf8");
    const secondMap = await fs.readFile(path.join(outTwo, "in", "tiny.js.map"), "utf8");
    expect(firstFile).toBe(secondFile);
    expect(firstMap).toBe(secondMap);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("produces different renamed identifiers for different seeds", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-diff-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const first = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outOne,
        seed: "seed-A",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: false
        },
        safety: {
          strictMode: true,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outTwo,
        seed: "seed-B",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: false
        },
        safety: {
          strictMode: true,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");
    const firstName = firstFile.match(/const (x_[a-f0-9]{6}) = 1;/)?.[1] ?? "";
    const secondName = secondFile.match(/const (x_[a-f0-9]{6}) = 1;/)?.[1] ?? "";

    expect(firstName.length).toBeGreaterThan(0);
    expect(secondName.length).toBeGreaterThan(0);
    expect(firstName).not.toBe(secondName);
    expect(first.report.manifestHash).not.toBe(second.report.manifestHash);
  });

  it("produces identical semantic-token identifier output for same seed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-semantic-same-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const buildConfig = (outDir: string) => ({
      root: tempRoot,
      inputs: [inputDir],
      outDir,
      seed: "semantic-seed-stable",
      pass2: {
        enabled: true,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "semanticTokens" as const,
        preservePublicAPI: false
      },
      safety: {
        strictMode: true,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    });

    const first = await obfuscate({ config: buildConfig(outOne) });
    const second = await obfuscate({ config: buildConfig(outTwo) });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");
    const renamed = firstFile.match(/const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";

    expect(firstFile).toBe(secondFile);
    expect(renamed).toMatch(/^(?:[a-z]+(?:_[0-9]+)?|[a-z]+_[a-z]+_[a-z]+_[1-9](?:_[0-9]+)?)$/);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("produces different semantic-token identifiers for different seeds", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-semantic-diff-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const buildConfig = (seed: string, outDir: string) => ({
      root: tempRoot,
      inputs: [inputDir],
      outDir,
      seed,
      pass2: {
        enabled: true,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "semanticTokens" as const,
        preservePublicAPI: false
      },
      safety: {
        strictMode: true,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    });

    const first = await obfuscate({ config: buildConfig("semantic-seed-a", outOne) });
    const second = await obfuscate({ config: buildConfig("semantic-seed-b", outTwo) });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");
    const firstName = firstFile.match(/const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";
    const secondName = secondFile.match(/const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";

    expect(firstName.length).toBeGreaterThan(0);
    expect(secondName.length).toBeGreaterThan(0);
    expect(firstName).not.toBe(secondName);
    expect(first.report.manifestHash).not.toBe(second.report.manifestHash);
  });

  it("produces identical semantic-token output with custom dictionary for same seed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-semantic-custom-same-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const buildConfig = (outDir: string) => ({
      root: tempRoot,
      inputs: [inputDir],
      outDir,
      seed: "semantic-custom-seed-stable",
      pass2: {
        enabled: true,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "semanticTokens" as const,
        semanticTokenDictionaryWords: ["ember", "forge", "ripple"],
        semanticTokenIncludeBuiltInVocabulary: false,
        preservePublicAPI: false
      },
      safety: {
        strictMode: true,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    });

    const first = await obfuscate({ config: buildConfig(outOne) });
    const second = await obfuscate({ config: buildConfig(outTwo) });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");

    expect(firstFile).toBe(secondFile);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("produces different semantic-token output with custom dictionary for different seeds", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-seed-semantic-custom-diff-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const buildConfig = (seed: string, outDir: string) => ({
      root: tempRoot,
      inputs: [inputDir],
      outDir,
      seed,
      pass2: {
        enabled: true,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "semanticTokens" as const,
        semanticTokenDictionaryWords: ["ember", "forge", "ripple"],
        semanticTokenIncludeBuiltInVocabulary: false,
        preservePublicAPI: false
      },
      safety: {
        strictMode: true,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    });

    const first = await obfuscate({ config: buildConfig("semantic-custom-seed-a", outOne) });
    const second = await obfuscate({ config: buildConfig("semantic-custom-seed-b", outTwo) });

    const firstFile = await fs.readFile(first.outputFiles[0], "utf8");
    const secondFile = await fs.readFile(second.outputFiles[0], "utf8");
    const firstName = firstFile.match(/const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";
    const secondName = secondFile.match(/const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";

    expect(firstName.length).toBeGreaterThan(0);
    expect(secondName.length).toBeGreaterThan(0);
    expect(firstName).not.toBe(secondName);
    expect(first.report.manifestHash).not.toBe(second.report.manifestHash);
  });

  it("produces stable verify diagnostics ordering and manifest hash for same seed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-determinism-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    const first = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out-a",
        seed: "verify-seed",
        sourceMaps: true,
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out-b",
        seed: "verify-seed",
        sourceMaps: true,
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    expect(first.outputFiles).toEqual([]);
    expect(second.outputFiles).toEqual([]);
    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("produces byte-stable cross-asset synchronized output for same seed", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "cross-asset-sync");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cross-asset-determinism-"));
    const outOne = path.join(tempRoot, "out-1");
    const outTwo = path.join(tempRoot, "out-2");

    const first = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: outOne,
        seed: "cross-asset-deterministic-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: false
        },
        safety: {
          strictMode: true,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: outTwo,
        seed: "cross-asset-deterministic-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: false
        },
        safety: {
          strictMode: true,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const firstHtml = await fs.readFile(path.join(outOne, "index.html"), "utf8");
    const secondHtml = await fs.readFile(path.join(outTwo, "index.html"), "utf8");
    const firstCss = await fs.readFile(path.join(outOne, "styles.css"), "utf8");
    const secondCss = await fs.readFile(path.join(outTwo, "styles.css"), "utf8");
    const firstJs = await fs.readFile(path.join(outOne, "app.js"), "utf8");
    const secondJs = await fs.readFile(path.join(outTwo, "app.js"), "utf8");

    expect(firstHtml).toBe(secondHtml);
    expect(firstCss).toBe(secondCss);
    expect(firstJs).toBe(secondJs);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("produces stable cross-asset diagnostics ordering for repeated non-strict runs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cross-asset-diagnostics-order-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      [
        "const one = document.getElementById('missing-id');",
        "const two = document.querySelector('div .unsupported');",
        "console.log(one, two);",
        ""
      ].join("\n"),
      "utf8"
    );

    const first = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out-a",
        seed: "cross-asset-diagnostics-seed",
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out-b",
        seed: "cross-asset-diagnostics-seed",
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
    expect(first.report.diagnostics.some((entry) => entry.includes("PASS2_CROSS_ASSET_UNRESOLVED"))).toBe(true);
    expect(first.report.diagnostics.some((entry) => entry.includes("PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR"))).toBe(true);
  });

  it("produces byte-stable contract-safety output and diagnostics for same seed", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-phase10-determinism-"));
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");

    const config = {
      root: fixtureRoot,
      inputs: ["runtime-globals.js", "dynamic-access.js", "public-contract.js"],
      seed: "phase10-deterministic-seed",
      pass2: {
        enabled: true,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "ambiguousTokens" as const,
        preservePublicAPI: false,
        rewritePublicContractSurfaces: false,
        publicContractSurfaceKinds: []
      },
      safety: {
        strictMode: false,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: ["window", "document", "globalThis"],
        detectDynamicNameAccess: true,
        abortOnDynamicNameAccessRisk: true,
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    };

    const first = await obfuscate({
      config: {
        ...config,
        outDir: outOne
      }
    });

    const second = await obfuscate({
      config: {
        ...config,
        outDir: outTwo
      }
    });

    for (const fileName of ["runtime-globals.js", "dynamic-access.js", "public-contract.js"]) {
      const firstFile = await fs.readFile(path.join(outOne, fileName), "utf8");
      const secondFile = await fs.readFile(path.join(outTwo, fileName), "utf8");
      expect(firstFile).toBe(secondFile);
    }

    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
    expect(first.report.diagnostics.some((entry) => entry.includes("PASS2_DYNAMIC_NAME_ACCESS_DETECTED"))).toBe(true);
    expect(first.report.diagnostics.some((entry) => entry.includes("PASS2_PUBLIC_CONTRACT_PRESERVED"))).toBe(true);
  });

  it("produces stable pass1 output and diagnostics ordering for same seed", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-js");
    const outOne = path.resolve(".vitest-temp", "pass1-determinism-out-1");
    const outTwo = path.resolve(".vitest-temp", "pass1-determinism-out-2");

    await fs.rm(outOne, { recursive: true, force: true });
    await fs.rm(outTwo, { recursive: true, force: true });

    const first = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: outOne,
        seed: "pass1-stable-seed",
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "base64",
            controlFlowFlattening: "safe",
            deadCodeInjection: true
          },
          css: {
            renameClasses: false,
            renameIds: false,
            renameCustomProperties: false
          },
          html: {
            rewriteInlineScripts: false,
            rewriteInlineStyles: false
          }
        },
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: outTwo,
        seed: "pass1-stable-seed",
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "base64",
            controlFlowFlattening: "safe",
            deadCodeInjection: true
          },
          css: {
            renameClasses: false,
            renameIds: false,
            renameCustomProperties: false
          },
          html: {
            rewriteInlineScripts: false,
            rewriteInlineStyles: false
          }
        },
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);

    for (const fileName of ["safe-literals.js", "unsupported-literals.js", "dead-code-skip.js", "dep.js"]) {
      const firstFile = await fs.readFile(path.join(outOne, fileName), "utf8");
      const secondFile = await fs.readFile(path.join(outTwo, fileName), "utf8");
      expect(firstFile).toBe(secondFile);
    }
  });

  it("varies dead-code injection layout for different seeds", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass1-deadcode-seed-"));
    const inputDir = path.join(tempRoot, "in");
    const outOne = path.join(tempRoot, "out-a");
    const outTwo = path.join(tempRoot, "out-b");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const first = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outOne,
        seed: "pass1-dead-a",
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "none",
            controlFlowFlattening: "off",
            deadCodeInjection: true
          },
          css: {
            renameClasses: false,
            renameIds: false,
            renameCustomProperties: false
          },
          html: {
            rewriteInlineScripts: false,
            rewriteInlineStyles: false
          }
        },
        pass2: {
          enabled: false,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        },
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const second = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outTwo,
        seed: "pass1-dead-b",
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "none",
            controlFlowFlattening: "off",
            deadCodeInjection: true
          },
          css: {
            renameClasses: false,
            renameIds: false,
            renameCustomProperties: false
          },
          html: {
            rewriteInlineScripts: false,
            rewriteInlineStyles: false
          }
        },
        pass2: {
          enabled: false,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        },
        safety: {
          strictMode: false,
          reservedNames: [],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      }
    });

    const firstFile = await fs.readFile(first.outputFiles.find((entry) => entry.endsWith("main.js")) ?? "", "utf8");
    const secondFile = await fs.readFile(second.outputFiles.find((entry) => entry.endsWith("main.js")) ?? "", "utf8");

    expect(firstFile).not.toBe(secondFile);
  });

  it("keeps phase11 semantic/noop output byte-stable for same seed", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-semantic-noise");
    const outOne = path.resolve(".vitest-temp", "phase11-determinism-out-1");
    const outTwo = path.resolve(".vitest-temp", "phase11-determinism-out-2");

    await fs.rm(outOne, { recursive: true, force: true });
    await fs.rm(outTwo, { recursive: true, force: true });

    const sharedConfig = {
      root: fixtureRoot,
      inputs: ["."],
      seed: "phase11-stable-seed",
      sourceMaps: false,
      pass1: {
        enabled: true,
        js: {
          renameLocals: true,
          stringEncoding: "none" as const,
          controlFlowFlattening: "off" as const,
          deadCodeInjection: false,
          semanticNoise: "safe" as const,
          noopNestingNoise: "safe" as const
        },
        css: {
          renameClasses: false,
          renameIds: false,
          renameCustomProperties: false,
          noopRuleNoise: "safe" as const
        },
        html: {
          rewriteInlineScripts: false,
          rewriteInlineStyles: false,
          noopStructuralNoise: "safe" as const
        }
      },
      pass2: {
        enabled: false,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "ambiguousTokens" as const,
        preservePublicAPI: true
      },
      safety: {
        strictMode: false,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true,
        abortOnSemanticNoiseRisk: true
      }
    };

    const first = await obfuscate({ config: { ...sharedConfig, outDir: outOne } });
    const second = await obfuscate({ config: { ...sharedConfig, outDir: outTwo } });

    for (const fileName of ["app.js", "index.html", "styles.css"]) {
      const firstFile = await fs.readFile(path.join(outOne, fileName), "utf8");
      const secondFile = await fs.readFile(path.join(outTwo, fileName), "utf8");
      expect(firstFile).toBe(secondFile);
    }

    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
    expect(first.report.manifestHash).toBe(second.report.manifestHash);
  });

  it("varies phase11 semantic/noop placement for different seeds", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-semantic-noise");
    const outOne = path.resolve(".vitest-temp", "phase11-seed-variation-out-a");
    const outTwo = path.resolve(".vitest-temp", "phase11-seed-variation-out-b");

    await fs.rm(outOne, { recursive: true, force: true });
    await fs.rm(outTwo, { recursive: true, force: true });

    const buildConfig = (seed: string, outDir: string) => ({
      root: fixtureRoot,
      inputs: ["."],
      outDir,
      seed,
      sourceMaps: false,
      pass1: {
        enabled: true,
        js: {
          renameLocals: true,
          stringEncoding: "none" as const,
          controlFlowFlattening: "off" as const,
          deadCodeInjection: false,
          semanticNoise: "safe" as const,
          noopNestingNoise: "safe" as const
        },
        css: {
          renameClasses: false,
          renameIds: false,
          renameCustomProperties: false,
          noopRuleNoise: "safe" as const
        },
        html: {
          rewriteInlineScripts: false,
          rewriteInlineStyles: false,
          noopStructuralNoise: "safe" as const
        }
      },
      pass2: {
        enabled: false,
        profile: "semantic-noise-v1" as const,
        identifierStyle: "ambiguousTokens" as const,
        preservePublicAPI: true
      },
      safety: {
        strictMode: false,
        reservedNames: [],
        reservedPatterns: [],
        reservedCssClasses: [],
        reservedGlobals: [],
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true,
        abortOnSemanticNoiseRisk: true
      }
    });

    await obfuscate({ config: buildConfig("phase11-seed-a", outOne) });
    await obfuscate({ config: buildConfig("phase11-seed-b", outTwo) });

    const jsA = await fs.readFile(path.join(outOne, "app.js"), "utf8");
    const jsB = await fs.readFile(path.join(outTwo, "app.js"), "utf8");
    const cssA = await fs.readFile(path.join(outOne, "styles.css"), "utf8");
    const cssB = await fs.readFile(path.join(outTwo, "styles.css"), "utf8");
    const htmlA = await fs.readFile(path.join(outOne, "index.html"), "utf8");
    const htmlB = await fs.readFile(path.join(outTwo, "index.html"), "utf8");

    expect(jsA).not.toBe(jsB);
    expect(cssA).toContain("--brand");
    expect(cssB).toContain("--brand");
    expect(htmlA).toContain("p1-noop:");
    expect(htmlB).toContain("p1-noop:");
    expect(htmlA).not.toBe(htmlB);
  });

  it("locks release deterministic artifacts for JS-only and cross-asset fixtures", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-release-determinism-fixtures-"));
    const jsFixtureRoot = path.resolve("tests", "fixtures", "pass2-js");
    const crossFixtureRoot = path.resolve("tests", "fixtures", "cross-asset-sync");

    const runAndCollect = async (fixtureRoot: string, outDir: string) =>
      obfuscate({
        config: {
          root: fixtureRoot,
          inputs: ["."],
          outDir,
          seed: "release-determinism-lock",
          sourceMaps: true,
          pass2: {
            enabled: true,
            profile: "semantic-noise-v1",
            identifierStyle: "ambiguousTokens",
            preservePublicAPI: false
          },
          safety: {
            strictMode: false,
            reservedNames: [],
            reservedPatterns: [],
            reservedCssClasses: [],
            reservedGlobals: [],
            abortOnCollision: true,
            abortOnDynamicEvalRisk: true
          }
        }
      });

    const jsRunOneOut = path.join(tempRoot, "js-run-1");
    const jsRunTwoOut = path.join(tempRoot, "js-run-2");
    const crossRunOneOut = path.join(tempRoot, "cross-run-1");
    const crossRunTwoOut = path.join(tempRoot, "cross-run-2");

    const jsFirst = await runAndCollect(jsFixtureRoot, jsRunOneOut);
    const jsSecond = await runAndCollect(jsFixtureRoot, jsRunTwoOut);
    const crossFirst = await runAndCollect(crossFixtureRoot, crossRunOneOut);
    const crossSecond = await runAndCollect(crossFixtureRoot, crossRunTwoOut);

    const jsMainOne = await fs.readFile(path.join(jsRunOneOut, "main.js"), "utf8");
    const jsMainTwo = await fs.readFile(path.join(jsRunTwoOut, "main.js"), "utf8");
    const jsUtilOne = await fs.readFile(path.join(jsRunOneOut, "util.js"), "utf8");
    const jsUtilTwo = await fs.readFile(path.join(jsRunTwoOut, "util.js"), "utf8");

    const crossHtmlOne = await fs.readFile(path.join(crossRunOneOut, "index.html"), "utf8");
    const crossHtmlTwo = await fs.readFile(path.join(crossRunTwoOut, "index.html"), "utf8");
    const crossCssOne = await fs.readFile(path.join(crossRunOneOut, "styles.css"), "utf8");
    const crossCssTwo = await fs.readFile(path.join(crossRunTwoOut, "styles.css"), "utf8");
    const crossJsOne = await fs.readFile(path.join(crossRunOneOut, "app.js"), "utf8");
    const crossJsTwo = await fs.readFile(path.join(crossRunTwoOut, "app.js"), "utf8");

    expect(jsMainOne).toBe(jsMainTwo);
    expect(jsUtilOne).toBe(jsUtilTwo);
    expect(jsFirst.report.manifestHash).toBe(jsSecond.report.manifestHash);
    expect(jsFirst.report.diagnostics).toEqual(jsSecond.report.diagnostics);

    expect(crossHtmlOne).toBe(crossHtmlTwo);
    expect(crossCssOne).toBe(crossCssTwo);
    expect(crossJsOne).toBe(crossJsTwo);
    expect(crossFirst.report.manifestHash).toBe(crossSecond.report.manifestHash);
    expect(crossFirst.report.diagnostics).toEqual(crossSecond.report.diagnostics);
  });
});