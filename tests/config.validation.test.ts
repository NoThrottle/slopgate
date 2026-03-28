import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/api/defaults";
import { mergeConfig } from "../src/config/merge";
import { validateConfig } from "../src/config/validation";
import { runCli } from "../src/cli/command";

describe("config validation", () => {
  it("fails when inputs are missing", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [],
      outDir: "dist-obf"
    });
    const issues = validateConfig(config);
    expect(issues.some((issue) => issue.path === "inputs")).toBe(true);
  });

  it("accepts a minimal valid config", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out"
    });
    const issues = validateConfig(config);
    expect(issues).toEqual([]);
  });

  it("verify command returns validation exit code when required args are missing", async () => {
    const code = await runCli(["verify"], {
      out: () => {},
      err: () => {}
    });

    expect(code).toBe(3);
  });

  it("rejects invalid pass1.js enum values", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out",
      pass1: {
        ...defaultConfig.pass1,
        js: {
          ...defaultConfig.pass1.js,
          stringEncoding: "invalid" as unknown as "none" | "base64",
          controlFlowFlattening: "invalid" as unknown as "off" | "safe",
          semanticNoise: "invalid" as unknown as "off" | "safe",
          noopNestingNoise: "invalid" as unknown as "off" | "safe"
        },
        css: {
          ...defaultConfig.pass1.css,
          noopRuleNoise: "invalid" as unknown as "off" | "safe"
        },
        html: {
          ...defaultConfig.pass1.html,
          noopStructuralNoise: "invalid" as unknown as "off" | "safe"
        }
      }
    });

    const issues = validateConfig(config);
    expect(issues.some((issue) => issue.path === "pass1.js.stringEncoding")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.js.controlFlowFlattening")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.js.semanticNoise")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.js.noopNestingNoise")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.css.noopRuleNoise")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.html.noopStructuralNoise")).toBe(true);
  });

  it("rejects invalid pass1 boolean switches", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out",
      pass1: {
        enabled: true,
        js: {
          renameLocals: "yes" as unknown as boolean,
          stringEncoding: "none",
          controlFlowFlattening: "off",
          deadCodeInjection: "no" as unknown as boolean
        },
        css: {
          renameClasses: "yes" as unknown as boolean,
          renameIds: true,
          renameCustomProperties: "no" as unknown as boolean
        },
        html: {
          rewriteInlineScripts: true,
          rewriteInlineStyles: "no" as unknown as boolean
        }
      }
    });

    const issues = validateConfig(config);
    expect(issues.some((issue) => issue.path === "pass1.js.renameLocals")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.js.deadCodeInjection")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.css.renameClasses")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.css.renameCustomProperties")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass1.html.rewriteInlineStyles")).toBe(true);
  });

  it("rejects invalid Phase 10 pass2 and safety control values", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out",
      pass2: {
        ...defaultConfig.pass2,
        identifierStyle: "invalid" as unknown as "ambiguousTokens",
        semanticTokenDictionaryWords: ["", "bad-word"] as unknown as string[],
        semanticTokenIncludeBuiltInVocabulary: "yes" as unknown as boolean,
        rewritePublicContractSurfaces: "yes" as unknown as boolean,
        publicContractSurfaceKinds: ["url", "invalid-kind"] as unknown as Array<
          "url" | "queryKey" | "routeName" | "eventKey" | "jsonField"
        >
      },
      safety: {
        ...defaultConfig.safety,
        detectDynamicNameAccess: "on" as unknown as boolean,
        abortOnDynamicNameAccessRisk: "off" as unknown as boolean,
        abortOnSemanticNoiseRisk: "blocked" as unknown as boolean
      }
    });

    const issues = validateConfig(config);
    expect(issues.some((issue) => issue.path === "pass2.identifierStyle")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass2.semanticTokenDictionaryWords[0]")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass2.semanticTokenDictionaryWords[1]")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass2.semanticTokenIncludeBuiltInVocabulary")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass2.rewritePublicContractSurfaces")).toBe(true);
    expect(issues.some((issue) => issue.path === "pass2.publicContractSurfaceKinds[1]")).toBe(true);
    expect(issues.some((issue) => issue.path === "safety.detectDynamicNameAccess")).toBe(true);
    expect(issues.some((issue) => issue.path === "safety.abortOnDynamicNameAccessRisk")).toBe(true);
    expect(issues.some((issue) => issue.path === "safety.abortOnSemanticNoiseRisk")).toBe(true);
  });

  it("accepts valid semantic-token dictionary configuration", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out",
      pass2: {
        ...defaultConfig.pass2,
        identifierStyle: "semanticTokens",
        semanticTokenDictionaryWords: ["brand", "accentTone", "layout_axis"],
        semanticTokenIncludeBuiltInVocabulary: false
      }
    });

    const issues = validateConfig(config);
    expect(issues).toEqual([]);
  });

  it("rejects non-array semantic-token dictionary values", () => {
    const config = mergeConfig(defaultConfig, {
      root: process.cwd(),
      inputs: [path.join("tests", "fixtures", "tiny.js")],
      outDir: ".vitest-temp/out",
      pass2: {
        ...defaultConfig.pass2,
        semanticTokenDictionaryWords: "brand" as unknown as string[]
      }
    });

    const issues = validateConfig(config);
    expect(issues.some((issue) => issue.path === "pass2.semanticTokenDictionaryWords")).toBe(true);
  });
});