export type AssetType = "html" | "css" | "js";

export interface Pass1JsConfig {
  renameLocals: boolean;
  stringEncoding: "none" | "base64";
  controlFlowFlattening: "off" | "safe";
  deadCodeInjection: boolean;
  semanticNoise?: "off" | "safe";
  noopNestingNoise?: "off" | "safe";
}

export interface Pass1CssConfig {
  renameClasses: boolean;
  renameIds: boolean;
  renameCustomProperties: boolean;
  noopRuleNoise?: "off" | "safe";
}

export interface Pass1HtmlConfig {
  rewriteInlineScripts: boolean;
  rewriteInlineStyles: boolean;
  noopStructuralNoise?: "off" | "safe";
}

export interface Pass1Config {
  enabled: boolean;
  js: Pass1JsConfig;
  css: Pass1CssConfig;
  html: Pass1HtmlConfig;
}

export interface Pass2Config {
  enabled: boolean;
  profile: "semantic-noise-v1";
  identifierStyle: "ambiguousTokens" | "semanticTokens";
  semanticTokenDictionaryWords?: string[];
  semanticTokenIncludeBuiltInVocabulary?: boolean;
  preservePublicAPI: boolean;
  rewritePublicContractSurfaces?: boolean;
  publicContractSurfaceKinds?: PublicContractSurfaceKind[];
}

export type PublicContractSurfaceKind =
  | "url"
  | "queryKey"
  | "routeName"
  | "eventKey"
  | "jsonField";

export interface SafetyConfig {
  strictMode: boolean;
  reservedNames: string[];
  reservedPatterns: string[];
  reservedCssClasses: string[];
  reservedGlobals: string[];
  abortOnCollision: boolean;
  abortOnDynamicEvalRisk: boolean;
  abortOnSemanticNoiseRisk?: boolean;
  detectDynamicNameAccess?: boolean;
  abortOnDynamicNameAccessRisk?: boolean;
}

export interface ReportingConfig {
  writeTransformLedger: boolean;
  writeJsonReport: boolean;
  verbosity: "silent" | "info";
}

export interface ObfuscatorConfig {
  root: string;
  inputs: string[];
  outDir: string;
  seed: string | number;
  sourceMaps: boolean;
  minify: boolean;
  pass1: Pass1Config;
  pass2: Pass2Config;
  safety: SafetyConfig;
  reporting: ReportingConfig;
}

export interface ObfuscateOptions {
  configPath?: string;
  config?: Partial<ObfuscatorConfig>;
  overrides?: Partial<ObfuscatorConfig>;
  jsonReportPath?: string;
}

export interface VerifyOptions {
  configPath?: string;
  config?: Partial<ObfuscatorConfig>;
  overrides?: Partial<ObfuscatorConfig>;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface TransformLedgerEntry {
  file: string;
  stages: string[];
}

export interface TransformReport {
  // Stable v1 contract fields used by CI/release automation.
  filesProcessed: number;
  diagnostics: string[];
  manifestHash: string;
  transformLedger: TransformLedgerEntry[];
  // Present for run mode only.
  artifactPaths?: string[];
}

export interface ObfuscationResult {
  success: boolean;
  filesProcessed: number;
  report: TransformReport;
  outputFiles: string[];
}