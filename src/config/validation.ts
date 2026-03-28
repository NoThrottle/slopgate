import type { ObfuscatorConfig, ValidationIssue } from "../api/types";

const publicContractSurfaceKinds = new Set([
  "url",
  "queryKey",
  "routeName",
  "eventKey",
  "jsonField"
]);
const identifierWordPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateConfig(config: ObfuscatorConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!config.root || typeof config.root !== "string") {
    issues.push({ path: "root", message: "root must be a non-empty string" });
  }

  if (!Array.isArray(config.inputs) || config.inputs.length === 0) {
    issues.push({ path: "inputs", message: "inputs must contain at least one path" });
  } else {
    for (let index = 0; index < config.inputs.length; index += 1) {
      if (typeof config.inputs[index] !== "string" || config.inputs[index].trim().length === 0) {
        issues.push({
          path: `inputs[${index}]`,
          message: "each input must be a non-empty string"
        });
      }
    }
  }

  if (!config.outDir || typeof config.outDir !== "string") {
    issues.push({ path: "outDir", message: "outDir must be a non-empty string" });
  }

  if (typeof config.seed !== "string" && typeof config.seed !== "number") {
    issues.push({ path: "seed", message: "seed must be a string or number" });
  }

  if (!config.pass1 || typeof config.pass1.enabled !== "boolean") {
    issues.push({ path: "pass1.enabled", message: "pass1.enabled must be a boolean" });
  } else {
    if (typeof config.pass1.js.renameLocals !== "boolean") {
      issues.push({ path: "pass1.js.renameLocals", message: "pass1.js.renameLocals must be a boolean" });
    }
    if (config.pass1.js.stringEncoding !== "none" && config.pass1.js.stringEncoding !== "base64") {
      issues.push({
        path: "pass1.js.stringEncoding",
        message: "pass1.js.stringEncoding must be one of: none, base64"
      });
    }
    if (config.pass1.js.controlFlowFlattening !== "off" && config.pass1.js.controlFlowFlattening !== "safe") {
      issues.push({
        path: "pass1.js.controlFlowFlattening",
        message: "pass1.js.controlFlowFlattening must be one of: off, safe"
      });
    }
    if (typeof config.pass1.js.deadCodeInjection !== "boolean") {
      issues.push({
        path: "pass1.js.deadCodeInjection",
        message: "pass1.js.deadCodeInjection must be a boolean"
      });
    }
    if (config.pass1.js.semanticNoise !== "off" && config.pass1.js.semanticNoise !== "safe") {
      issues.push({
        path: "pass1.js.semanticNoise",
        message: "pass1.js.semanticNoise must be one of: off, safe"
      });
    }
    if (config.pass1.js.noopNestingNoise !== "off" && config.pass1.js.noopNestingNoise !== "safe") {
      issues.push({
        path: "pass1.js.noopNestingNoise",
        message: "pass1.js.noopNestingNoise must be one of: off, safe"
      });
    }

    if (typeof config.pass1.css.renameClasses !== "boolean") {
      issues.push({
        path: "pass1.css.renameClasses",
        message: "pass1.css.renameClasses must be a boolean"
      });
    }
    if (typeof config.pass1.css.renameIds !== "boolean") {
      issues.push({ path: "pass1.css.renameIds", message: "pass1.css.renameIds must be a boolean" });
    }
    if (typeof config.pass1.css.renameCustomProperties !== "boolean") {
      issues.push({
        path: "pass1.css.renameCustomProperties",
        message: "pass1.css.renameCustomProperties must be a boolean"
      });
    }
    if (config.pass1.css.noopRuleNoise !== "off" && config.pass1.css.noopRuleNoise !== "safe") {
      issues.push({
        path: "pass1.css.noopRuleNoise",
        message: "pass1.css.noopRuleNoise must be one of: off, safe"
      });
    }

    if (typeof config.pass1.html.rewriteInlineScripts !== "boolean") {
      issues.push({
        path: "pass1.html.rewriteInlineScripts",
        message: "pass1.html.rewriteInlineScripts must be a boolean"
      });
    }
    if (typeof config.pass1.html.rewriteInlineStyles !== "boolean") {
      issues.push({
        path: "pass1.html.rewriteInlineStyles",
        message: "pass1.html.rewriteInlineStyles must be a boolean"
      });
    }
    if (config.pass1.html.noopStructuralNoise !== "off" && config.pass1.html.noopStructuralNoise !== "safe") {
      issues.push({
        path: "pass1.html.noopStructuralNoise",
        message: "pass1.html.noopStructuralNoise must be one of: off, safe"
      });
    }
  }

  if (!config.pass2 || typeof config.pass2.enabled !== "boolean") {
    issues.push({ path: "pass2.enabled", message: "pass2.enabled must be a boolean" });
  } else {
    if (config.pass2.identifierStyle !== "ambiguousTokens" && config.pass2.identifierStyle !== "semanticTokens") {
      issues.push({
        path: "pass2.identifierStyle",
        message: "pass2.identifierStyle must be one of: ambiguousTokens, semanticTokens"
      });
    }

    if (!Array.isArray(config.pass2.semanticTokenDictionaryWords)) {
      issues.push({
        path: "pass2.semanticTokenDictionaryWords",
        message: "pass2.semanticTokenDictionaryWords must be an array"
      });
    } else {
      for (let index = 0; index < config.pass2.semanticTokenDictionaryWords.length; index += 1) {
        const word = config.pass2.semanticTokenDictionaryWords[index];
        if (typeof word !== "string" || word.trim().length === 0) {
          issues.push({
            path: `pass2.semanticTokenDictionaryWords[${index}]`,
            message: "semantic token dictionary words must be non-empty strings"
          });
          continue;
        }

        if (!identifierWordPattern.test(word)) {
          issues.push({
            path: `pass2.semanticTokenDictionaryWords[${index}]`,
            message: "semantic token dictionary words must match: ^[A-Za-z_][A-Za-z0-9_]*$"
          });
        }
      }
    }

    if (typeof config.pass2.semanticTokenIncludeBuiltInVocabulary !== "boolean") {
      issues.push({
        path: "pass2.semanticTokenIncludeBuiltInVocabulary",
        message: "pass2.semanticTokenIncludeBuiltInVocabulary must be a boolean"
      });
    }

    if (typeof config.pass2.rewritePublicContractSurfaces !== "boolean") {
      issues.push({
        path: "pass2.rewritePublicContractSurfaces",
        message: "pass2.rewritePublicContractSurfaces must be a boolean"
      });
    }

    if (!Array.isArray(config.pass2.publicContractSurfaceKinds)) {
      issues.push({
        path: "pass2.publicContractSurfaceKinds",
        message: "pass2.publicContractSurfaceKinds must be an array"
      });
    } else {
      for (let index = 0; index < config.pass2.publicContractSurfaceKinds.length; index += 1) {
        const kind = config.pass2.publicContractSurfaceKinds[index];
        if (!publicContractSurfaceKinds.has(kind)) {
          issues.push({
            path: `pass2.publicContractSurfaceKinds[${index}]`,
            message: "public contract surface kind must be one of: url, queryKey, routeName, eventKey, jsonField"
          });
        }
      }
    }
  }

  if (!config.safety || typeof config.safety.strictMode !== "boolean") {
    issues.push({ path: "safety.strictMode", message: "safety.strictMode must be a boolean" });
  }

  if (!Array.isArray(config.safety.reservedNames)) {
    issues.push({ path: "safety.reservedNames", message: "reservedNames must be an array" });
  }

  if (!Array.isArray(config.safety.reservedPatterns)) {
    issues.push({ path: "safety.reservedPatterns", message: "reservedPatterns must be an array" });
  }

  if (!Array.isArray(config.safety.reservedCssClasses)) {
    issues.push({ path: "safety.reservedCssClasses", message: "reservedCssClasses must be an array" });
  }

  if (typeof config.safety.detectDynamicNameAccess !== "boolean") {
    issues.push({
      path: "safety.detectDynamicNameAccess",
      message: "safety.detectDynamicNameAccess must be a boolean"
    });
  }

  if (typeof config.safety.abortOnDynamicNameAccessRisk !== "boolean") {
    issues.push({
      path: "safety.abortOnDynamicNameAccessRisk",
      message: "safety.abortOnDynamicNameAccessRisk must be a boolean"
    });
  }

  if (typeof config.safety.abortOnSemanticNoiseRisk !== "boolean") {
    issues.push({
      path: "safety.abortOnSemanticNoiseRisk",
      message: "safety.abortOnSemanticNoiseRisk must be a boolean"
    });
  }

  return issues;
}