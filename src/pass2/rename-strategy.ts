import { hashText } from "../core/seed";

const builtInSemanticColors = [
  "black",
  "white",
  "red",
  "green",
  "blue",
  "amber",
  "cyan",
  "gray",
  "teal",
  "indigo",
  "orange",
  "mint",
  "rose",
  "slate"
] as const;
const builtInSemanticDomains = [
  "border",
  "layout",
  "text",
  "shadow",
  "motion",
  "grid",
  "spacing",
  "layer",
  "state",
  "theme",
  "surface",
  "focus"
] as const;
const builtInSemanticAxes = [
  "px",
  "py",
  "mx",
  "my",
  "w",
  "h",
  "gap",
  "inset",
  "x",
  "y",
  "start",
  "end"
] as const;
const identifierWordPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SemanticTokenVocabularyOptions {
  dictionaryWords?: string[];
  includeBuiltInVocabulary?: boolean;
}

interface SemanticTokenVocabulary {
  colors: string[];
  domains: string[];
  axes: string[];
}

export type IdentifierStyle = "ambiguousTokens" | "semanticTokens";

export function generateDeterministicName(seed: string, index: number): string {
  const token = hashText(`${seed}:${index}`).slice(0, 6);
  return `x_${token}`;
}

export function generateDeterministicIdentifierName(
  seed: string,
  index: number,
  style: IdentifierStyle,
  semanticTokenOptions: SemanticTokenVocabularyOptions = {}
): string {
  if (style === "semanticTokens") {
    return generateSemanticTokenName(seed, index, resolveSemanticTokenVocabulary(semanticTokenOptions));
  }
  return generateDeterministicName(seed, index);
}

export function allocateDeterministicUniqueName(
  seed: string,
  startIndex: number,
  usedTargets: Set<string>,
  style: IdentifierStyle = "ambiguousTokens",
  semanticTokenOptions: SemanticTokenVocabularyOptions = {}
): { name: string; nextIndex: number; attempts: number } {
  let cursor = startIndex;
  let attempts = 0;
  while (true) {
    const candidate = generateDeterministicIdentifierName(seed, cursor, style, semanticTokenOptions);
    cursor += 1;
    attempts += 1;
    if (usedTargets.has(candidate)) {
      continue;
    }
    usedTargets.add(candidate);
    return {
      name: candidate,
      nextIndex: cursor,
      attempts
    };
  }
}

function generateSemanticTokenName(seed: string, index: number, vocabulary: SemanticTokenVocabulary): string {
  const familyValue = readHashByte(hashText(`${seed}:semantic:${index}:family`));
  const useFlatToken = familyValue % 3 === 0;

  if (useFlatToken) {
    const color = vocabulary.colors[familyValue % vocabulary.colors.length];
    const cycle = Math.floor(index / vocabulary.colors.length);
    return cycle === 0 ? color : `${color}_${cycle + 1}`;
  }

  const domainValue = readHashByte(hashText(`${seed}:semantic:${index}:domain`));
  const colorValue = readHashByte(hashText(`${seed}:semantic:${index}:color`));
  const axisValue = readHashByte(hashText(`${seed}:semantic:${index}:axis`));
  const nValue = readHashByte(hashText(`${seed}:semantic:${index}:n`));

  const domain = vocabulary.domains[domainValue % vocabulary.domains.length];
  const color = vocabulary.colors[colorValue % vocabulary.colors.length];
  const axis = vocabulary.axes[axisValue % vocabulary.axes.length];
  const n = (nValue % 9) + 1;
  const compositeSpace = vocabulary.domains.length * vocabulary.colors.length * vocabulary.axes.length * 9;
  const cycle = Math.floor(index / compositeSpace);
  const base = `${domain}_${color}_${axis}_${n}`;
  return cycle === 0 ? base : `${base}_${cycle + 1}`;
}

function resolveSemanticTokenVocabulary(options: SemanticTokenVocabularyOptions): SemanticTokenVocabulary {
  const includeBuiltIns = options.includeBuiltInVocabulary ?? true;
  const normalizedCustomWords = normalizeDictionaryWords(options.dictionaryWords ?? []);

  if (!includeBuiltIns && normalizedCustomWords.length === 0) {
    return {
      colors: [...builtInSemanticColors],
      domains: [...builtInSemanticDomains],
      axes: [...builtInSemanticAxes]
    };
  }

  const colors = includeBuiltIns ? [...builtInSemanticColors] : [];
  const domains = includeBuiltIns ? [...builtInSemanticDomains] : [];
  const axes = includeBuiltIns ? [...builtInSemanticAxes] : [];

  appendUnique(colors, normalizedCustomWords);
  appendUnique(domains, normalizedCustomWords);
  appendUnique(axes, normalizedCustomWords);

  return {
    colors,
    domains,
    axes
  };
}

function normalizeDictionaryWords(words: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const sanitized = sanitizeDictionaryWord(word);
    if (!sanitized || seen.has(sanitized)) {
      continue;
    }
    seen.add(sanitized);
    output.push(sanitized);
  }

  return output;
}

function sanitizeDictionaryWord(word: string): string | null {
  const trimmed = word.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_");
  if (normalized.length === 0) {
    return null;
  }

  const prefixed = /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
  if (!identifierWordPattern.test(prefixed)) {
    return null;
  }

  return prefixed;
}

function appendUnique(target: string[], source: string[]): void {
  for (const item of source) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

function readHashByte(token: string): number {
  return Number.parseInt(token.slice(0, 2), 16);
}