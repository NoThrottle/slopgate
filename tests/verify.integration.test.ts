import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obfuscate, verify } from "../src/api";

describe("verify integration", () => {
  it("keeps run and verify diagnostics parity for identical non-strict config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-run-verify-parity-"));
    const inputDir = path.join(tempRoot, "input");
    const runOutDir = path.join(tempRoot, "run-out");
    const verifyOutDir = path.join(tempRoot, "verify-out");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    const sharedConfig = {
      root: tempRoot,
      inputs: [inputDir],
      seed: "run-verify-parity",
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
    };

    const runResult = await obfuscate({
      config: {
        ...sharedConfig,
        outDir: runOutDir
      }
    });

    const verifyResult = await verify({
      config: {
        ...sharedConfig,
        outDir: verifyOutDir
      }
    });

    expect(runResult.report.diagnostics).toEqual(verifyResult.report.diagnostics);
    expect(runResult.report.manifestHash).not.toBe(verifyResult.report.manifestHash);
    expect(verifyResult.outputFiles).toEqual([]);
  });

  it("returns success, emits no files, and reports analyzed assets", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-ok-"));
    const inputDir = path.join(tempRoot, "input");
    const outDir = path.join(tempRoot, "out");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\n", "utf8");

    const result = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir,
        seed: "verify-ok",
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

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
    expect(result.outputFiles).toEqual([]);
    expect(result.report.diagnostics).toEqual([]);

    const outputExists = await fs
      .stat(path.join(outDir, "input", "tiny.js"))
      .then(() => true)
      .catch(() => false);
    const sourceMapExists = await fs
      .stat(path.join(outDir, "input", "tiny.js.map"))
      .then(() => true)
      .catch(() => false);
    const manifestExists = await fs
      .stat(path.join(outDir, "run-manifest.json"))
      .then(() => true)
      .catch(() => false);

    expect(outputExists).toBe(false);
    expect(sourceMapExists).toBe(false);
    expect(manifestExists).toBe(false);
  });

  it("throws SafetyPolicyViolation in strict mode when graph issues exist", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-strict-fail-"));
    const inputDir = path.join(tempRoot, "input");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    await expect(
      verify({
        config: {
          root: tempRoot,
          inputs: [inputDir],
          outDir: "out",
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
      })
    ).rejects.toMatchObject({
      name: "SafetyPolicyViolation",
      message: expect.stringContaining("GRAPH_UNRESOLVED_JS")
    });
  });

  it("returns success with graph diagnostics in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-nonstrict-diag-"));
    const inputDir = path.join(tempRoot, "input");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    const result = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out",
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

    expect(result.success).toBe(true);
    expect(result.outputFiles).toEqual([]);
    expect(result.report.diagnostics.some((entry) => entry.includes("GRAPH_UNRESOLVED_JS"))).toBe(true);
  });

  it("keeps pass1 diagnostics parity between run and verify", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-css-html");
    const runOut = path.resolve(".vitest-temp", "pass1-parity-run");
    const verifyOut = path.resolve(".vitest-temp", "pass1-parity-verify");
    await fs.rm(runOut, { recursive: true, force: true });
    await fs.rm(verifyOut, { recursive: true, force: true });

    const pass1Config = {
      enabled: true,
      js: {
        renameLocals: true,
        stringEncoding: "none" as const,
        controlFlowFlattening: "off" as const,
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
    };

    const safetyConfig = {
      strictMode: false,
      reservedNames: [],
      reservedPatterns: [],
      reservedCssClasses: [],
      reservedGlobals: [],
      abortOnCollision: true,
      abortOnDynamicEvalRisk: true
    };

    const runResult = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: runOut,
        sourceMaps: false,
        pass1: pass1Config,
        pass2: {
          enabled: false,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        },
        safety: safetyConfig
      }
    });

    const verifyResult = await verify({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir: verifyOut,
        sourceMaps: false,
        pass1: pass1Config,
        pass2: {
          enabled: false,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        },
        safety: safetyConfig
      }
    });

    expect(verifyResult.outputFiles).toEqual([]);
    expect(runResult.report.diagnostics).toEqual(verifyResult.report.diagnostics);
    expect(runResult.report.diagnostics.every((entry, index, list) => index === 0 || list[index - 1] <= entry)).toBe(true);
  });

  it("writes run json report and never writes a verify json report counterpart", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-no-json-report-"));
    const inputDir = path.join(tempRoot, "input");
    const runOut = path.join(tempRoot, "run-out");
    const verifyOut = path.join(tempRoot, "verify-out");
    const runReportPath = path.join(tempRoot, "run-report.json");
    const verifyReportPath = path.join(tempRoot, "verify-report.json");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\n", "utf8");

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: runOut,
        seed: "run-report-seed"
      },
      jsonReportPath: runReportPath
    });

    await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: verifyOut,
        seed: "verify-report-seed"
      }
    });

    const runReportExists = await fs
      .stat(runReportPath)
      .then(() => true)
      .catch(() => false);
    const verifyReportExists = await fs
      .stat(verifyReportPath)
      .then(() => true)
      .catch(() => false);

    expect(runReportExists).toBe(true);
    expect(verifyReportExists).toBe(false);
  });

  it("keeps run and verify parity for dynamic-access and public-contract diagnostics", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");
    const runOut = path.resolve(".vitest-temp", "phase10-run-parity");
    const verifyOut = path.resolve(".vitest-temp", "phase10-verify-parity");
    await fs.rm(runOut, { recursive: true, force: true });
    await fs.rm(verifyOut, { recursive: true, force: true });

    const sharedConfig = {
      root: fixtureRoot,
      inputs: ["dynamic-access.js", "public-contract.js"],
      seed: "phase10-run-verify-parity",
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
        reservedGlobals: [],
        detectDynamicNameAccess: true,
        abortOnDynamicNameAccessRisk: true,
        abortOnCollision: true,
        abortOnDynamicEvalRisk: true
      }
    };

    const runResult = await obfuscate({
      config: {
        ...sharedConfig,
        outDir: runOut
      }
    });

    const verifyResult = await verify({
      config: {
        ...sharedConfig,
        outDir: verifyOut
      }
    });

    expect(runResult.report.diagnostics).toEqual(verifyResult.report.diagnostics);
    expect(runResult.report.diagnostics.some((entry) => entry.includes("PASS2_DYNAMIC_NAME_ACCESS_DETECTED"))).toBe(true);
    expect(runResult.report.diagnostics.some((entry) => entry.includes("PASS2_PUBLIC_CONTRACT_PRESERVED"))).toBe(true);
  });

  it("keeps run and verify parity for phase11 semantic/noop diagnostics", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-semantic-noise");
    const runOut = path.resolve(".vitest-temp", "phase11-run-parity");
    const verifyOut = path.resolve(".vitest-temp", "phase11-verify-parity");
    await fs.rm(runOut, { recursive: true, force: true });
    await fs.rm(verifyOut, { recursive: true, force: true });

    const sharedConfig = {
      root: fixtureRoot,
      inputs: ["."],
      seed: "phase11-run-verify-parity",
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

    const runResult = await obfuscate({
      config: {
        ...sharedConfig,
        outDir: runOut
      }
    });

    const verifyResult = await verify({
      config: {
        ...sharedConfig,
        outDir: verifyOut
      }
    });

    expect(verifyResult.outputFiles).toEqual([]);
    expect(runResult.report.diagnostics).toEqual(verifyResult.report.diagnostics);
    expect(runResult.report.diagnostics.some((entry) => entry.includes("PASS1_JS_SEMANTIC_NOISE_APPLIED"))).toBe(true);
    expect(runResult.report.diagnostics.some((entry) => entry.includes("PASS1_CSS_NOOP_RULE_APPLIED"))).toBe(true);
    expect(runResult.report.diagnostics.some((entry) => entry.includes("PASS1_HTML_NOOP_STRUCTURE_APPLIED"))).toBe(true);
  });
});
