export const PASS1_DIAGNOSTIC_TAGS = {
  jsStringEncodingUnsupported: "PASS1_JS_STRING_ENCODING_UNSUPPORTED",
  jsControlFlowUnsupported: "PASS1_JS_CONTROL_FLOW_UNSUPPORTED",
  jsDeadCodeSkipped: "PASS1_JS_DEAD_CODE_SKIPPED",
  jsSemanticNoiseApplied: "PASS1_JS_SEMANTIC_NOISE_APPLIED",
  jsSemanticNoiseSkipped: "PASS1_JS_SEMANTIC_NOISE_SKIPPED",
  jsNoopNestingApplied: "PASS1_JS_NOOP_NESTING_APPLIED",
  jsNoopNestingSkipped: "PASS1_JS_NOOP_NESTING_SKIPPED",
  cssNoopRuleApplied: "PASS1_CSS_NOOP_RULE_APPLIED",
  cssNoopRuleSkipped: "PASS1_CSS_NOOP_RULE_SKIPPED",
  htmlNoopStructureApplied: "PASS1_HTML_NOOP_STRUCTURE_APPLIED",
  htmlNoopStructureSkipped: "PASS1_HTML_NOOP_STRUCTURE_SKIPPED",
  semanticNoiseUnsupported: "PASS1_SEMANTIC_NOISE_UNSUPPORTED",
  semanticNoiseRisk: "PASS1_SEMANTIC_NOISE_RISK",
  htmlInlineUnsupported: "PASS1_HTML_INLINE_UNSUPPORTED",
  cssSelectorScopeUnsupported: "PASS1_CSS_SELECTOR_SCOPE_UNSUPPORTED"
} as const;

export type Pass1DiagnosticTag = (typeof PASS1_DIAGNOSTIC_TAGS)[keyof typeof PASS1_DIAGNOSTIC_TAGS];

export function createPass1Diagnostic(
  tag: Pass1DiagnosticTag,
  relativePath: string,
  detail: string
): string {
  return `[${tag}] ${relativePath} :: ${detail}`;
}

export function mergeDeterministicDiagnostics(
  diagnostics: string[],
  incoming: string[]
): string[] {
  const merged = new Set<string>([...diagnostics, ...incoming]);
  return [...merged].sort((left, right) => left.localeCompare(right));
}

const PASS1_INFORMATIONAL_TAGS = new Set<Pass1DiagnosticTag>([
  PASS1_DIAGNOSTIC_TAGS.jsSemanticNoiseApplied,
  PASS1_DIAGNOSTIC_TAGS.jsSemanticNoiseSkipped,
  PASS1_DIAGNOSTIC_TAGS.jsNoopNestingApplied,
  PASS1_DIAGNOSTIC_TAGS.jsNoopNestingSkipped,
  PASS1_DIAGNOSTIC_TAGS.cssNoopRuleApplied,
  PASS1_DIAGNOSTIC_TAGS.cssNoopRuleSkipped,
  PASS1_DIAGNOSTIC_TAGS.htmlNoopStructureApplied,
  PASS1_DIAGNOSTIC_TAGS.htmlNoopStructureSkipped
]);

export function extractDiagnosticTag(diagnostic: string): string | null {
  const match = /^\[([^\]]+)\]/.exec(diagnostic);
  return match?.[1] ?? null;
}

export function isInformationalPass1Diagnostic(tag: string): boolean {
  return PASS1_INFORMATIONAL_TAGS.has(tag as Pass1DiagnosticTag);
}
