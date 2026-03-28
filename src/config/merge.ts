import type { ObfuscatorConfig } from "../api/types";

export function mergeConfig(base: ObfuscatorConfig, partial: Partial<ObfuscatorConfig>): ObfuscatorConfig {
  const mergedInputs = partial.inputs ?? base.inputs;
  const mergedPublicContractSurfaceKinds =
    partial.pass2?.publicContractSurfaceKinds ?? base.pass2.publicContractSurfaceKinds ?? [];
  const mergedSemanticTokenDictionaryWords =
    partial.pass2?.semanticTokenDictionaryWords ?? base.pass2.semanticTokenDictionaryWords ?? [];
  const mergedReservedNames = partial.safety?.reservedNames ?? base.safety.reservedNames;
  const mergedReservedPatterns = partial.safety?.reservedPatterns ?? base.safety.reservedPatterns;
  const mergedReservedCssClasses = partial.safety?.reservedCssClasses ?? base.safety.reservedCssClasses;
  const mergedReservedGlobals = partial.safety?.reservedGlobals ?? base.safety.reservedGlobals;

  return {
    ...base,
    ...partial,
    pass1: {
      ...base.pass1,
      ...partial.pass1,
      js: {
        ...base.pass1.js,
        ...partial.pass1?.js
      },
      css: {
        ...base.pass1.css,
        ...partial.pass1?.css
      },
      html: {
        ...base.pass1.html,
        ...partial.pass1?.html
      }
    },
    pass2: {
      ...base.pass2,
      ...partial.pass2,
      semanticTokenDictionaryWords: Array.isArray(mergedSemanticTokenDictionaryWords)
        ? [...mergedSemanticTokenDictionaryWords]
        : (mergedSemanticTokenDictionaryWords as unknown as string[]),
      publicContractSurfaceKinds: [...mergedPublicContractSurfaceKinds]
    },
    safety: {
      ...base.safety,
      ...partial.safety,
      reservedNames: [...mergedReservedNames],
      reservedPatterns: [...mergedReservedPatterns],
      reservedCssClasses: [...mergedReservedCssClasses],
      reservedGlobals: [...mergedReservedGlobals]
    },
    reporting: {
      ...base.reporting,
      ...partial.reporting
    },
    inputs: [...mergedInputs]
  };
}