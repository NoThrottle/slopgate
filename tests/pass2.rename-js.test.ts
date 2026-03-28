import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obfuscate } from "../src/api";

describe("pass2 rename js", () => {
  it("renames safe lexical bindings and keeps non-identifier content unchanged", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-js");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-"));
    const outDir = "out";

    const result = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir,
        seed: "pass2-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: true
        },
        safety: {
          strictMode: false,
          reservedNames: ["reservedName"],
          reservedPatterns: [],
          reservedCssClasses: [],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDir)
      }
    });

    const mainOut = await fs.readFile(path.join(tempRoot, outDir, "main.js"), "utf8");
    const utilOut = await fs.readFile(path.join(tempRoot, outDir, "util.js"), "utf8");

    expect(mainOut).toMatch(/const x_[a-f0-9]{6} = localValue \+ 1;/);
    expect(mainOut).toContain(".reservedName");
    expect(mainOut).toContain('["reservedName"]');
    expect(mainOut).toContain("// reservedName in comment should not be renamed");
    expect(mainOut).toContain('"reservedName in string should stay the same"');
    expect(mainOut).toContain("reservedName");
    expect(mainOut).toContain("CapitalName");

    expect(utilOut).toContain("export const value = 41;");
    expect(utilOut).toContain("export const reservedName = 7;");
    expect(utilOut).toContain("export const CapitalName = 100;");
    expect(
      result.report.diagnostics.some(
        (entry) =>
          entry.includes("PASS2_RENAME_SKIPPED_INELIGIBLE") ||
          entry.includes("PASS2_RENAME_SKIPPED_DYNAMIC_ACCESS") ||
          entry.includes("PASS2_PUBLIC_CONTRACT_PRESERVED")
      )
    ).toBe(true);
  });

  it("keeps import/export bindings consistent across files when public api preservation is disabled", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-link-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "export const value = 1;\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import { value } from './util.js';\nconst total = value + 1;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "link-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedExport = utilOut.match(/export const (x_[a-f0-9]{6}) = 1;/)?.[1] ?? "";
    expect(renamedExport.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import { ${renamedExport} } from './util.js';`);
    expect(mainOut).toContain(`${renamedExport} + 1`);
  });

  it("keeps import/export linkage consistent when semantic token names are enabled", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-link-semantic-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import { value } from './util.js';\nconst total = value + 1;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "link-semantic-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "semanticTokens",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedExport = utilOut.match(/export const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";
    expect(renamedExport.length).toBeGreaterThan(0);
    expect(renamedExport).toMatch(/^(?:[a-z]+(?:_[0-9]+)?|[a-z]+_[a-z]+_[a-z]+_[1-9](?:_[0-9]+)?)$/);
    expect(mainOut).toContain(`import { ${renamedExport} } from './util.js';`);
    expect(mainOut).toContain(`${renamedExport} + 1`);
  });

  it("uses configured semantic dictionary words and keeps import linkage consistent", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-link-semantic-custom-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import { value } from './util.js';\nconst total = value + 1;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "link-semantic-custom-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "semanticTokens",
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
      }
    });

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedExport = utilOut.match(/export const ([A-Za-z_][A-Za-z0-9_]*) = 1;/)?.[1] ?? "";
    expect(renamedExport.length).toBeGreaterThan(0);
    expect(renamedExport).toMatch(/(?:ember|forge|ripple)/);
    expect(mainOut).toContain(`import { ${renamedExport} } from './util.js';`);
    expect(mainOut).toContain(`${renamedExport} + 1`);
  });

  it("avoids semantic-token collisions with ineligible shorthand bindings", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-semantic-collision-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "const black = 1;\nconst value = 2;\nconst obj = { black };\nconsole.log(value, obj.black);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "seed18",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "semanticTokens",
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

    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");
    const declarations = [...mainOut.matchAll(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((match) => match[1]);
    const duplicateDeclarations = declarations.filter(
      (name, index) => declarations.indexOf(name) !== index
    );

    expect(mainOut).toContain("const black = 1;");
    expect(mainOut).toContain("{ black }");
    expect(duplicateDeclarations).toEqual([]);
  });

  it("avoids duplicate declarations when custom dictionary words collide with local names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-semantic-custom-collision-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "const ember = 1;\nconst value = 2;\nconst obj = { ember };\nconsole.log(value, obj.ember);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "semantic-custom-collision-seed",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "semanticTokens",
          semanticTokenDictionaryWords: ["ember"],
          semanticTokenIncludeBuiltInVocabulary: false,
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

    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");
    const declarations = [...mainOut.matchAll(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((match) => match[1]);
    const duplicateDeclarations = declarations.filter((name, index) => declarations.indexOf(name) !== index);

    expect(mainOut).toContain("const ember = 1;");
    expect(mainOut).toContain("{ ember }");
    expect(duplicateDeclarations).toEqual([]);
  });

  it("links default export backing local with default import local consistently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-default-link-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "const localValue = 2;\nexport default localValue;\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import localDefault from './util.js';\nconst total = localDefault + 1;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "default-link-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedDefault = utilOut.match(/export default (x_[a-f0-9]{6});/)?.[1] ?? "";
    expect(renamedDefault.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import ${renamedDefault} from './util.js';`);
    expect(mainOut).toContain(`${renamedDefault} + 1`);
  });

  it("links async named default function export/import consistently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-default-async-fn-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "export default async function loadValue() {\n  return 2;\n}\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import localDefault from './util.js';\nconst total = localDefault;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "default-async-fn-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedDefault = utilOut.match(/export default async function (x_[a-f0-9]{6})\s*\(/)?.[1] ?? "";
    expect(renamedDefault.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import ${renamedDefault} from './util.js';`);
    expect(mainOut).toContain(`= ${renamedDefault};`);
  });

  it("links generator named default function export/import consistently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-default-generator-fn-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "export default function* streamValue() {\n  yield 2;\n}\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import localDefault from './util.js';\nconst total = localDefault;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "default-generator-fn-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedDefault = utilOut.match(/export default function\* (x_[a-f0-9]{6})\s*\(/)?.[1] ?? "";
    expect(renamedDefault.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import ${renamedDefault} from './util.js';`);
    expect(mainOut).toContain(`= ${renamedDefault};`);
  });

  it("links async generator named default function export/import consistently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-default-async-generator-fn-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "export default async function* streamAsyncValue() {\n  yield 2;\n}\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import localDefault from './util.js';\nconst total = localDefault;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "default-async-generator-fn-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedDefault = utilOut.match(/export default async function\* (x_[a-f0-9]{6})\s*\(/)?.[1] ?? "";
    expect(renamedDefault.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import ${renamedDefault} from './util.js';`);
    expect(mainOut).toContain(`= ${renamedDefault};`);
  });

  it("links export-list default alias with default import consistently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-default-list-alias-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "util.js"),
      "const localAlias = 2;\nexport { localAlias as default };\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import localDefault from './util.js';\nconst total = localDefault + 1;\nconsole.log(total);\n",
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "default-list-alias-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    const renamedDefault = utilOut.match(/export \{ (x_[a-f0-9]{6}) as default \};/)?.[1] ?? "";
    expect(renamedDefault.length).toBeGreaterThan(0);
    expect(mainOut).toContain(`import ${renamedDefault} from './util.js';`);
    expect(mainOut).toContain(`${renamedDefault} + 1`);
  });

  it("skips renaming exporter locals when module has namespace import consumer and emits diagnostic", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-namespace-skip-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      "import * as ns from './util.js';\nconsole.log(ns.value);\n",
      "utf8"
    );

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "namespace-skip-seed",
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

    const utilOut = await fs.readFile(path.join(outputDir, "in", "util.js"), "utf8");
    expect(utilOut).toContain("export const value = 1;");
    expect(
      result.report.diagnostics.some((entry) => entry.includes("PASS2_RENAME_SKIPPED_NAMESPACE_LINKAGE"))
    ).toBe(true);
  });

  it("preserves object shorthand and destructuring identifiers while still renaming safe lexical bindings", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-object-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      [
        "let local = 1;",
        "const obj = { local };",
        "({ local = 0 } = obj);",
        "const safeValue = local + 1;",
        "console.log(local, safeValue);",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "object-seed",
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

    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");

    expect(mainOut).toContain("let local = 1;");
    expect(mainOut).toMatch(/const x_[a-f0-9]{6} = \{ local \};/);
    expect(mainOut).toMatch(/\(\{ local = 0 \} = x_[a-f0-9]{6}\);/);
    expect(mainOut).toMatch(/const x_[a-f0-9]{6} = local \+ 1;/);
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_RENAME_SKIPPED_SHORTHAND"))).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_RENAME_SKIPPED_DESTRUCTURING"))).toBe(
      true
    );
  });

  it("renames object-literal longhand value identifiers while preserving key names", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-longhand-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "main.js"),
      [
        "const valueOnly = 2;",
        "const wrapped = { key: valueOnly };",
        "console.log(wrapped, valueOnly);",
        ""
      ].join("\n"),
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "longhand-seed",
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

    const mainOut = await fs.readFile(path.join(outputDir, "in", "main.js"), "utf8");
    expect(mainOut).toContain("key:");
    expect(mainOut).not.toContain("valueOnly");
  });

  it("synchronizes static selector renames across JS, HTML, and CSS", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "cross-asset-sync");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-cross-asset-"));
    const outDir = "out";

    await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir,
        seed: "cross-asset-seed",
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
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDir)
      }
    });

    const htmlOut = await fs.readFile(path.join(tempRoot, outDir, "index.html"), "utf8");
    const cssOut = await fs.readFile(path.join(tempRoot, outDir, "styles.css"), "utf8");
    const jsOut = await fs.readFile(path.join(tempRoot, outDir, "app.js"), "utf8");

    const renamedId = htmlOut.match(/id="(x_[a-f0-9]{6})"/)?.[1] ?? "";
    const renamedClass = htmlOut.match(/class="(x_[a-f0-9]{6})"/)?.[1] ?? "";
    expect(renamedId.length).toBeGreaterThan(0);
    expect(renamedClass.length).toBeGreaterThan(0);

    expect(cssOut).toContain(`#${renamedId}`);
    expect(cssOut).toContain(`.${renamedClass}`);

    expect(jsOut).toContain(`document.getElementById("${renamedId}")`);
    expect(jsOut).toContain(`document.getElementsByClassName("${renamedClass}")`);
    expect(jsOut).toContain(`document.querySelector(".${renamedClass}")`);
    expect(jsOut).toContain(`document.querySelectorAll("#${renamedId}")`);
  });

  it("skips reserved CSS class selector renames while still allowing id synchronization", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "cross-asset-sync");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-cross-asset-reserved-"));
    const outDir = "out";

    await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["."],
        outDir,
        seed: "cross-asset-reserved-seed",
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
          reservedCssClasses: ["shell"],
          reservedGlobals: [],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDir)
      }
    });

    const htmlOut = await fs.readFile(path.join(tempRoot, outDir, "index.html"), "utf8");
    const cssOut = await fs.readFile(path.join(tempRoot, outDir, "styles.css"), "utf8");
    const jsOut = await fs.readFile(path.join(tempRoot, outDir, "app.js"), "utf8");

    expect(htmlOut).toContain("class=\"shell\"");
    expect(cssOut).toContain(".shell");
    expect(jsOut).toContain("querySelector(\".shell\")");
    expect(jsOut).toContain("getElementsByClassName(\"shell\")");
  });

  it("does not rewrite inline script class/id-like strings while rewriting real HTML attributes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-cross-asset-inline-script-"));
    const inputDir = path.join(tempRoot, "in");
    const outputDir = path.join(tempRoot, "out");

    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(
      path.join(inputDir, "index.html"),
      [
        "<!doctype html>",
        "<html>",
        "  <body>",
        "    <script>",
        "      const marker = \"class=\\\"shell\\\" id=\\\"app\\\"\";",
        "      document.querySelector(\".shell\");",
        "    </script>",
        "    <main id=\"app\" class=\"shell\">hello</main>",
        "    <script type=\"module\" src=\"./app.js\"></script>",
        "  </body>",
        "</html>",
        ""
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(path.join(inputDir, "styles.css"), "#app.shell { color: #123456; }\n", "utf8");
    await fs.writeFile(
      path.join(inputDir, "app.js"),
      [
        "document.getElementById(\"app\");",
        "document.getElementsByClassName(\"shell\");",
        "document.querySelector(\".shell\");",
        "document.querySelectorAll(\"#app\");",
        ""
      ].join("\n"),
      "utf8"
    );

    await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: outputDir,
        seed: "cross-asset-inline-script-seed",
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

    const htmlOut = await fs.readFile(path.join(outputDir, "in", "index.html"), "utf8");

    expect(htmlOut).toContain('const marker = "class=\\"shell\\" id=\\"app\\"";');
    expect(htmlOut).toContain('document.querySelector(".shell");');
    expect(htmlOut).toMatch(/<main id="x_[a-f0-9]{6}" class="x_[a-f0-9]{6}">hello<\/main>/);
    expect(htmlOut).not.toContain('<main id="app" class="shell">hello</main>');
  });

  it("obfuscates runtime-global aliases and keeps their targets distinct from unrelated symbols", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-runtime-globals-"));
    const outDir = "out";

    await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["runtime-globals.js"],
        outDir,
        seed: "runtime-global-target-lock",
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
          reservedGlobals: ["window", "document", "globalThis"],
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDir)
      }
    });

    const runtimeOut = await fs.readFile(path.join(tempRoot, outDir, "runtime-globals.js"), "utf8");
    const runtimeWindowTarget = runtimeOut.match(/const (x_[a-f0-9]{6}) = window;/)?.[1] ?? "";
    const runtimeDocumentTarget = runtimeOut.match(/const (x_[a-f0-9]{6}) = document;/)?.[1] ?? "";
    const regularTarget = runtimeOut.match(/const (x_[a-f0-9]{6}) = 1;/)?.[1] ?? "";

    expect(runtimeWindowTarget.length).toBeGreaterThan(0);
    expect(runtimeDocumentTarget.length).toBeGreaterThan(0);
    expect(regularTarget.length).toBeGreaterThan(0);
    expect(runtimeWindowTarget).not.toBe(regularTarget);
    expect(runtimeDocumentTarget).not.toBe(regularTarget);
  });

  it("detects dynamic-name access and skips linked renames safely", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-dynamic-access-"));
    const outDir = "out";

    const result = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["dynamic-access.js"],
        outDir,
        seed: "dynamic-access-safety",
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
          detectDynamicNameAccess: true,
          abortOnDynamicNameAccessRisk: true,
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDir)
      }
    });

    const dynamicOut = await fs.readFile(path.join(tempRoot, outDir, "dynamic-access.js"), "utf8");
    expect(dynamicOut).toContain("const dynamicKey = \"routeName\";");
    expect(dynamicOut).toContain("const routeName = payload[`${dynamicKey}`];");
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_DYNAMIC_NAME_ACCESS_DETECTED"))).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.includes("PASS2_RENAME_SKIPPED_DYNAMIC_ACCESS"))).toBe(true);
  });

  it("preserves public contract surfaces by default and rewrites only with explicit opt-in", async () => {
    const fixtureRoot = path.resolve("tests", "fixtures", "pass2-contract-safety");
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-pass2-public-contract-"));
    const outDefault = "out-default";
    const outOptIn = "out-opt-in";

    const preserved = await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["public-contract.js"],
        outDir: outDefault,
        seed: "public-contract-default",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
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
          abortOnCollision: true,
          abortOnDynamicEvalRisk: true
        }
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outDefault)
      }
    });

    const preservedOut = await fs.readFile(path.join(tempRoot, outDefault, "public-contract.js"), "utf8");
    expect(preservedOut).toContain("const userId = 7;");
    expect(preserved.report.diagnostics.some((entry) => entry.includes("PASS2_PUBLIC_CONTRACT_PRESERVED"))).toBe(true);
    expect(preserved.report.diagnostics.some((entry) => entry.includes("PASS2_PUBLIC_CONTRACT_OPT_IN_REQUIRED"))).toBe(true);

    await obfuscate({
      config: {
        root: fixtureRoot,
        inputs: ["public-contract.js"],
        outDir: outOptIn,
        seed: "public-contract-opt-in",
        pass2: {
          enabled: true,
          profile: "semantic-noise-v1",
          identifierStyle: "ambiguousTokens",
          preservePublicAPI: false,
          rewritePublicContractSurfaces: true,
          publicContractSurfaceKinds: ["url", "queryKey", "jsonField"]
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
      },
      overrides: {
        root: fixtureRoot,
        outDir: path.join(tempRoot, outOptIn)
      }
    });

    const optInOut = await fs.readFile(path.join(tempRoot, outOptIn, "public-contract.js"), "utf8");
    expect(optInOut).not.toContain("const userId = 7;");
    expect(optInOut).toMatch(/const x_[a-f0-9]{6} = 7;/);
  });
});