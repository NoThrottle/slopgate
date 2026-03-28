import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { obfuscate, verify } from "../src/api";
import { runCli } from "../src/cli/command";
import * as sourceMapModule from "../src/emit/sourcemap";
import type { SymbolGraph } from "../src/graph/symbol-graph";
import { buildReservedState } from "../src/policy/reserved";
import { evaluateGuardrails } from "../src/pass2/guardrails";

describe("safety strictness", () => {
  it("fails closed in strict mode when source-map verification emits diagnostics", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-sourcemap-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const value = 1;\n", "utf8");

    const sourceMapSpy = vi
      .spyOn(sourceMapModule, "buildSourceMapPlaceholders")
      .mockReturnValue({
        "in/main.js": JSON.stringify({
          version: 3,
          file: "main.js",
          sources: ["in/main.js"],
          names: [],
          mappings: ""
        })
      });

    await expect(
      obfuscate({
        config: {
          root: tempRoot,
          inputs: [inputDir],
          outDir: "out",
          sourceMaps: true,
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
      message: expect.stringContaining("SOURCEMAP_MAPPINGS_EMPTY")
    });

    sourceMapSpy.mockRestore();
  });

  it("records source-map verification diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-sourcemap-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const value = 1;\n", "utf8");

    const sourceMapSpy = vi
      .spyOn(sourceMapModule, "buildSourceMapPlaceholders")
      .mockReturnValue({
        "in/main.js": JSON.stringify({
          version: 3,
          file: "main.js",
          names: [],
          mappings: ";"
        })
      });

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out",
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
    expect(result.report.diagnostics.some((entry) => entry.includes("SOURCEMAP_SOURCES_MISSING"))).toBe(true);

    sourceMapSpy.mockRestore();
  });

  it("fails closed in strict mode when graph diagnostics are present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    await expect(
      obfuscate({
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

  it("records diagnostics but allows output in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");

    const result = await obfuscate({
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

    expect(result.report.diagnostics.some((entry) => entry.includes("GRAPH_UNRESOLVED_JS"))).toBe(true);
  });

  it("detects dynamic execution risk beyond eval", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-dynamic-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "Function('return 1')();\n", "utf8");

    await expect(
      obfuscate({
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
      message: expect.stringContaining("GUARD_DYNAMIC_EVAL")
    });
  });

  it("fails closed in strict mode when pass2 unsupported pattern is present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-unsupported-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "class Example {}\n", "utf8");

    await expect(
      obfuscate({
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
      message: expect.stringContaining("PASS2_UNSUPPORTED_PATTERN")
    });
  });

  it("records pass2 unsupported pattern diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-unsupported-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "class Example {}\n", "utf8");

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_UNSUPPORTED_PATTERN"))).toBe(true);
  });

  it("fails closed in strict mode when unsupported object destructuring is present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-destructure-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const { config: { port } } = settings;\n", "utf8");

    await expect(
      obfuscate({
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
      message: expect.stringContaining("PASS2_UNSUPPORTED_DESTRUCTURING")
    });
  });

  it("records unsupported object destructuring diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-destructure-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const { config: { port } } = settings;\n", "utf8");

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_UNSUPPORTED_DESTRUCTURING"))).toBe(true);
  });

  it("fails closed in strict mode when default import linkage cannot be resolved", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-default-link-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "const named = 1;\nexport { named };\n", "utf8");
    await fs.writeFile(path.join(inputDir, "main.js"), "import localDefault from './util.js';\n", "utf8");

    await expect(
      obfuscate({
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
      message: expect.stringContaining("PASS2_DEFAULT_LINK_UNRESOLVED")
    });
  });

  it("records unresolved default import linkage diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-default-link-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "const named = 1;\nexport { named };\n", "utf8");
    await fs.writeFile(path.join(inputDir, "main.js"), "import localDefault from './util.js';\n", "utf8");

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_DEFAULT_LINK_UNRESOLVED"))).toBe(true);
  });

  it("does not emit unresolved default-link diagnostics in strict mode for supported named default forms", async () => {
    const cases: Array<{ name: string; utilCode: string }> = [
      {
        name: "async named default function",
        utilCode: "export default async function loadValue() {\n  return 1;\n}\n"
      },
      {
        name: "generator named default function",
        utilCode: "export default function* streamValue() {\n  yield 1;\n}\n"
      },
      {
        name: "async generator named default function",
        utilCode: "export default async function* streamAsyncValue() {\n  yield 1;\n}\n"
      },
      {
        name: "export-list default alias",
        utilCode: "const localValue = 1;\nexport { localValue as default };\n"
      }
    ];

    for (const testCase of cases) {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-default-link-supported-strict-"));
      const inputDir = path.join(tempRoot, "in");
      await fs.mkdir(inputDir, { recursive: true });
      await fs.writeFile(path.join(inputDir, "util.js"), testCase.utilCode, "utf8");
      await fs.writeFile(
        path.join(inputDir, "main.js"),
        "import localDefault from './util.js';\nconst ref = localDefault;\nconsole.log(ref);\n",
        "utf8"
      );

      const result = await obfuscate({
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
      });

      expect(result.success, testCase.name).toBe(true);
      expect(
        result.report.diagnostics.some((entry) => entry.includes("PASS2_DEFAULT_LINK_UNRESOLVED")),
        testCase.name
      ).toBe(false);
    }
  });

  it("fails closed in strict mode when namespace import uses dynamic member access", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-namespace-dynamic-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import * as ns from './util.js';\nconst key = 'value';\nconsole.log(ns[key]);\n",
      "utf8"
    );

    await expect(
      obfuscate({
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
      message: expect.stringMatching(/PASS2_UNSUPPORTED_NAMESPACE_DYNAMIC_MEMBER|PASS2_DYNAMIC_NAME_ACCESS_DETECTED/)
    });
  });

  it("records namespace dynamic member diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-namespace-dynamic-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import * as ns from './util.js';\nconst key = 'value';\nconsole.log(ns[key]);\n",
      "utf8"
    );

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_UNSUPPORTED_NAMESPACE_DYNAMIC_MEMBER"))).toBe(true);
  });

  it("fails closed in strict mode when namespace dynamic member uses template interpolation", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-namespace-template-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import * as ns from './util.js';\nconst key = 'value';\nconsole.log(ns[`${key}`]);\n",
      "utf8"
    );

    await expect(
      obfuscate({
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
      message: expect.stringMatching(/PASS2_UNSUPPORTED_NAMESPACE_DYNAMIC_MEMBER|PASS2_DYNAMIC_NAME_ACCESS_DETECTED/)
    });
  });

  it("records namespace dynamic template member diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-namespace-template-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import * as ns from './util.js';\nconst key = 'value';\nconsole.log(ns[`${key}`]);\n",
      "utf8"
    );

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_UNSUPPORTED_NAMESPACE_DYNAMIC_MEMBER"))).toBe(true);
  });

  it("fails closed in strict mode when dynamic-name access risk is detected", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");

    await expect(
      obfuscate({
        config: {
          root: fixtureRoot,
          inputs: ["dynamic-access.js"],
          outDir: path.resolve(".vitest-temp", "pass2-dynamic-strict-fail"),
          safety: {
            strictMode: true,
            reservedNames: [],
            reservedPatterns: [],
            reservedCssClasses: [],
            reservedGlobals: [],
            detectDynamicNameAccess: true,
            abortOnDynamicNameAccessRisk: true,
            abortOnCollision: true,
            abortOnDynamicEvalRisk: true
          }
        }
      })
    ).rejects.toMatchObject({
      name: "SafetyPolicyViolation",
      message: expect.stringContaining("PASS2_DYNAMIC_NAME_ACCESS_DETECTED")
    });
  });

  it("flags runtime-global target reuse violations in strict mode guardrails", () => {
    const reserved = buildReservedState([], [], []);
    const emptyGraph: SymbolGraph = {
      files: [],
      identifiersByFile: {},
      bindingsByFile: {},
      importsByFile: {},
      exportsByFile: {},
      ineligibleByFile: {},
      ineligibleReasonsByFile: {},
      runtimeGlobalAliasesByFile: {},
      dynamicNameRiskByFile: {},
      publicContractNamesByFile: {},
      selectorRefsByFile: {},
      crossAssetDiagnostics: []
    };

    const guardrail = evaluateGuardrails(
      [],
      emptyGraph,
      {
        entries: [
          {
            file: "main.js",
            from: "runtimeWindow",
            to: "x_deadbe",
            mode: "identifier",
            runtimeGlobalAlias: true
          },
          {
            file: "main.js",
            from: "regularOne",
            to: "x_deadbe",
            mode: "identifier"
          }
        ],
        diagnostics: []
      },
      reserved,
      true,
      true,
      true,
      false,
      true
    );

    expect(guardrail.violated).toBe(true);
    expect(guardrail.diagnostics.some((entry) => entry.includes("GUARD_RUNTIME_GLOBAL_TARGET_REUSE"))).toBe(true);
  });

  it("fails closed in strict mode when cross-asset selector linkage is unresolved", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cross-asset-unresolved-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "const el = document.getElementById('missingApp');\nconsole.log(el);\n",
      "utf8"
    );

    await expect(
      obfuscate({
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
      message: expect.stringContaining("PASS2_CROSS_ASSET_UNRESOLVED")
    });
  });

  it("records unresolved cross-asset selector diagnostics and continues in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cross-asset-unresolved-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "const el = document.querySelector('#missingApp');\nconsole.log(el);\n",
      "utf8"
    );

    const result = await obfuscate({
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
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_CROSS_ASSET_UNRESOLVED"))).toBe(true);
  });

  it("verify fails closed in strict mode when graph diagnostics are present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-strict-"));
    const inputDir = path.join(tempRoot, "in");
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

  it("verify records diagnostics and succeeds in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-verify-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
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

    const emittedExists = await fs
      .stat(path.join(tempRoot, "out", "in", "main.js"))
      .then(() => true)
      .catch(() => false);
    expect(emittedExists).toBe(false);
  });

  it("fails closed in strict mode when pass1 string-encoding diagnostics are present", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-js");
    await expect(
      obfuscate({
        config: {
          root: fixtureRoot,
          inputs: ["unsupported-literals.js", "dep.js"],
          outDir: path.resolve(".vitest-temp", "pass1-strict-fail"),
          sourceMaps: false,
          pass1: {
            enabled: true,
            js: {
              renameLocals: true,
              stringEncoding: "base64",
              controlFlowFlattening: "off",
              deadCodeInjection: false
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
      message: expect.stringContaining("PASS1_JS_STRING_ENCODING_UNSUPPORTED")
    });
  });

  it("records pass1 diagnostics and succeeds in non-strict mode", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass1-js");
    const result = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["unsupported-literals.js", "dep.js"],
        outDir: path.resolve(".vitest-temp", "pass1-nonstrict-ok"),
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "base64",
            controlFlowFlattening: "off",
            deadCodeInjection: false
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

    expect(result.success).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS1_JS_STRING_ENCODING_UNSUPPORTED"))).toBe(true);
  });

  it("fails closed in strict mode when phase11 semantic risk diagnostics are present", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-phase11-risk-strict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const run = eval('1+1');\nconsole.log(run);\n", "utf8");

    await expect(
      obfuscate({
        config: {
          root: tempRoot,
          inputs: [inputDir],
          outDir: "out",
          sourceMaps: false,
          pass1: {
            enabled: true,
            js: {
              renameLocals: true,
              stringEncoding: "none",
              controlFlowFlattening: "off",
              deadCodeInjection: false,
              semanticNoise: "safe",
              noopNestingNoise: "off"
            },
            css: {
              renameClasses: false,
              renameIds: false,
              renameCustomProperties: false,
              noopRuleNoise: "off"
            },
            html: {
              rewriteInlineScripts: false,
              rewriteInlineStyles: false,
              noopStructuralNoise: "off"
            }
          },
          pass2: {
            enabled: false,
            profile: "semantic-noise-v1",
            identifierStyle: "ambiguousTokens",
            preservePublicAPI: true
          },
          safety: {
            strictMode: true,
            reservedNames: [],
            reservedPatterns: [],
            reservedCssClasses: [],
            reservedGlobals: [],
            abortOnCollision: true,
            abortOnDynamicEvalRisk: true,
            abortOnSemanticNoiseRisk: true
          }
        }
      })
    ).rejects.toMatchObject({
      name: "SafetyPolicyViolation",
      message: expect.stringContaining("PASS1_SEMANTIC_NOISE_RISK")
    });
  });

  it("records phase11 semantic risk diagnostics in non-strict mode", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-phase11-risk-nonstrict-"));
    const inputDir = path.join(tempRoot, "in");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "const run = eval('1+1');\nconsole.log(run);\n", "utf8");

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: "out",
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "none",
            controlFlowFlattening: "off",
            deadCodeInjection: false,
            semanticNoise: "safe",
            noopNestingNoise: "off"
          },
          css: {
            renameClasses: false,
            renameIds: false,
            renameCustomProperties: false,
            noopRuleNoise: "off"
          },
          html: {
            rewriteInlineScripts: false,
            rewriteInlineStyles: false,
            noopStructuralNoise: "off"
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
          abortOnDynamicEvalRisk: true,
          abortOnSemanticNoiseRisk: true
        }
      }
    });

    expect(result.success).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS1_SEMANTIC_NOISE_RISK"))).toBe(true);
  });

  it("does not rewrite if/else text contained inside string literals", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass1-controlflow-string-"));
    const inputDir = path.join(tempRoot, "in");
    const outDir = path.join(tempRoot, "out");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "const marker = \"if (flag) { yes(); } else { no(); }\";\nconsole.log(marker);\n",
      "utf8"
    );

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir,
        sourceMaps: false,
        pass1: {
          enabled: true,
          js: {
            renameLocals: true,
            stringEncoding: "none",
            controlFlowFlattening: "safe",
            deadCodeInjection: false
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

    expect(result.success).toBe(true);
    const emitted = await fs.readFile(path.join(outDir, "in", "main.js"), "utf8");
    expect(emitted).toContain("if (flag) { yes(); } else { no(); }");
    expect(emitted).not.toContain("__p1_cf_");
  });

  it("injects dead code only at syntax-safe boundaries", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass1-deadcode-safe-boundary-"));
    const inputDir = path.join(tempRoot, "in");
    const outDir = path.join(tempRoot, "out");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "for (let i = 0; i < 2; i++) { console.log(i); }", "utf8");

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir,
        seed: "pass1-deadcode-syntax-safe",
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

    expect(result.success).toBe(true);
    const emitted = await fs.readFile(path.join(outDir, "in", "main.js"), "utf8");
    expect(() => new Function(emitted)).not.toThrow();
  });

  it("returns exit code 2 for strict CLI runs on the same diagnostic source", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-strict-parity-"));
    const inputDir = path.join(tempRoot, "in");
    const configPath = path.join(tempRoot, "strict.config.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
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
        },
        null,
        2
      ),
      "utf8"
    );

    const code = await runCli(["run", "--config", configPath], {
      out: () => {},
      err: () => {}
    });

    expect(code).toBe(2);
  });

  it("returns exit code 0 and exposes diagnostics in non-strict CLI runs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-nonstrict-parity-"));
    const inputDir = path.join(tempRoot, "in");
    const configPath = path.join(tempRoot, "nonstrict.config.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
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
        },
        null,
        2
      ),
      "utf8"
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(["run", "--config", configPath], {
      out: (line) => stdout.push(line),
      err: (line) => stderr.push(line)
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("GRAPH_UNRESOLVED_JS");
  });
});
