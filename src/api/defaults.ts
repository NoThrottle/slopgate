import type { ObfuscatorConfig } from "./types";

export const defaultConfig: ObfuscatorConfig = {
  root: ".",
  inputs: [],
  outDir: "dist-obf",
  seed: "default-seed",
  sourceMaps: true,
  minify: true,
  pass1: {
    enabled: true,
    js: {
      renameLocals: true,
      stringEncoding: "none",
      controlFlowFlattening: "off",
      deadCodeInjection: false,
      semanticNoise: "off",
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
    enabled: true,
    profile: "semantic-noise-v1",
    identifierStyle: "ambiguousTokens",
    semanticTokenDictionaryWords: [],
    semanticTokenIncludeBuiltInVocabulary: true,
    preservePublicAPI: true,
    rewritePublicContractSurfaces: false,
    publicContractSurfaceKinds: []
  },
  safety: {
    strictMode: true,
    reservedNames: ["React", "Vue", "Svelte", "$", "jQuery"],
    reservedPatterns: ["^__", "^data-", "^aria-"],
    reservedCssClasses: ["is-active", "is-open"],
    reservedGlobals: ["window", "document", "globalThis"],
    abortOnCollision: true,
    abortOnDynamicEvalRisk: true,
    abortOnSemanticNoiseRisk: true,
    detectDynamicNameAccess: true,
    abortOnDynamicNameAccessRisk: true
  },
  reporting: {
    writeTransformLedger: true,
    writeJsonReport: false,
    verbosity: "info"
  }
};