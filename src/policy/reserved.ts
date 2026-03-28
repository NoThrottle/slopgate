export const ecmaReservedKeywords = [
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
];

export const knownHostGlobals = [
  "window",
  "document",
  "globalThis",
  "console",
  "setTimeout",
  "clearTimeout",
  "fetch"
];

export interface ReservedState {
  names: Set<string>;
  patterns: RegExp[];
  cssClasses: Set<string>;
}

export function buildReservedState(
  userNames: string[],
  userPatterns: string[],
  reservedCssClasses: string[] = []
): ReservedState {
  const names = new Set<string>([...ecmaReservedKeywords, ...knownHostGlobals, ...userNames]);
  const patterns = userPatterns.map((pattern) => new RegExp(pattern));
  const cssClasses = new Set<string>(reservedCssClasses);
  return { names, patterns, cssClasses };
}

export function isReservedName(name: string, state: ReservedState): boolean {
  if (state.names.has(name)) {
    return true;
  }
  return state.patterns.some((pattern) => pattern.test(name));
}

export function isReservedCssClass(name: string, state: ReservedState): boolean {
  return state.cssClasses.has(name);
}