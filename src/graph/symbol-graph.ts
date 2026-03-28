import type { PipelineAsset } from "../core/types";
import type { PublicContractSurfaceKind } from "../api/types";
import { extractCrossAssetLinks, type SelectorReference } from "./cross-asset-links";

export interface SymbolBinding {
  name: string;
  index: number;
  kind: "declaration" | "import";
}

export interface ImportBinding {
  local: string;
  imported: string;
  source: string;
  index: number;
}

export interface ExportBinding {
  local: string;
  exported: string;
  index: number;
}

export interface SymbolGraph {
  files: string[];
  identifiersByFile: Record<string, string[]>;
  bindingsByFile: Record<string, SymbolBinding[]>;
  importsByFile: Record<string, ImportBinding[]>;
  exportsByFile: Record<string, ExportBinding[]>;
  ineligibleByFile: Record<string, string[]>;
  ineligibleReasonsByFile: Record<string, Record<string, string[]>>;
  runtimeGlobalAliasesByFile: Record<string, string[]>;
  dynamicNameRiskByFile: Record<string, string[]>;
  publicContractNamesByFile: Record<string, Record<PublicContractSurfaceKind, string[]>>;
  selectorRefsByFile: Record<string, SelectorReference[]>;
  crossAssetDiagnostics: string[];
}

export function buildSymbolGraph(assets: PipelineAsset[], reservedGlobals: string[] = []): SymbolGraph {
  const identifiersByFile: Record<string, string[]> = {};
  const bindingsByFile: Record<string, SymbolBinding[]> = {};
  const importsByFile: Record<string, ImportBinding[]> = {};
  const exportsByFile: Record<string, ExportBinding[]> = {};
  const ineligibleByFile: Record<string, string[]> = {};
  const ineligibleReasonsByFile: Record<string, Record<string, string[]>> = {};
  const runtimeGlobalAliasesByFile: Record<string, string[]> = {};
  const dynamicNameRiskByFile: Record<string, string[]> = {};
  const publicContractNamesByFile: Record<string, Record<PublicContractSurfaceKind, string[]>> = {};
  const knownRuntimeGlobals = new Set<string>(["window", "document", "globalThis", ...reservedGlobals]);
  const selectorExtraction = extractCrossAssetLinks(assets);
  for (const asset of assets) {
    const detail =
      asset.type === "js"
        ? extractJsSymbols(asset.code, knownRuntimeGlobals)
        : {
            identifiers: [] as string[],
            bindings: [] as SymbolBinding[],
            imports: [] as ImportBinding[],
            exports: [] as ExportBinding[],
            ineligible: [] as string[],
            ineligibleReasons: {} as Record<string, string[]>,
            runtimeGlobalAliases: [] as string[],
            dynamicNameRiskIdentifiers: [] as string[],
            publicContractIdentifiers: createEmptyPublicContractMap()
          };
    const identifiers = detail.identifiers;
    identifiersByFile[asset.relativePath] = identifiers;
    bindingsByFile[asset.relativePath] = detail.bindings;
    importsByFile[asset.relativePath] = detail.imports;
    exportsByFile[asset.relativePath] = detail.exports;
    ineligibleByFile[asset.relativePath] = detail.ineligible;
    ineligibleReasonsByFile[asset.relativePath] = detail.ineligibleReasons;
    runtimeGlobalAliasesByFile[asset.relativePath] = detail.runtimeGlobalAliases;
    dynamicNameRiskByFile[asset.relativePath] = detail.dynamicNameRiskIdentifiers;
    publicContractNamesByFile[asset.relativePath] = detail.publicContractIdentifiers;
  }

  const files = assets.map((asset) => asset.relativePath).sort((left, right) => left.localeCompare(right));

  return {
    files,
    identifiersByFile,
    bindingsByFile,
    importsByFile,
    exportsByFile,
    ineligibleByFile,
    ineligibleReasonsByFile,
    runtimeGlobalAliasesByFile,
    dynamicNameRiskByFile,
    publicContractNamesByFile,
    selectorRefsByFile: selectorExtraction.refsByFile,
    crossAssetDiagnostics: selectorExtraction.diagnostics
  };
}

function extractJsSymbols(code: string, knownRuntimeGlobals: Set<string>): {
  identifiers: string[];
  bindings: SymbolBinding[];
  imports: ImportBinding[];
  exports: ExportBinding[];
  ineligible: string[];
  ineligibleReasons: Record<string, string[]>;
  runtimeGlobalAliases: string[];
  dynamicNameRiskIdentifiers: string[];
  publicContractIdentifiers: Record<PublicContractSurfaceKind, string[]>;
} {
  const sanitized = stripJsCommentsAndStrings(code);
  const commentsOnly = stripJsComments(code);
  const declarations = extractDeclarationBindings(sanitized);
  const imports = extractImportBindings(commentsOnly);
  const exports = extractExportBindings(sanitized);

  const bindings = [...declarations, ...imports.map((entry) => ({ name: entry.local, index: entry.index, kind: "import" as const }))].sort(
    (left, right) => left.index - right.index || left.name.localeCompare(right.name)
  );

  const identifiers = bindings.map((entry) => entry.name);
  const ineligible = collectIneligibleNames(code, bindings);
  const bindingNames = new Set<string>(identifiers);
  const runtimeGlobalAliases = extractRuntimeGlobalAliases(sanitized, knownRuntimeGlobals, bindingNames);
  const dynamicNameRiskIdentifiers = extractDynamicNameRiskIdentifiers(code, bindingNames);
  const publicContractIdentifiers = extractPublicContractIdentifiers(code);

  return {
    identifiers,
    bindings,
    imports: imports.sort((left, right) => left.index - right.index || left.local.localeCompare(right.local)),
    exports: exports.sort((left, right) => left.index - right.index || left.local.localeCompare(right.local)),
    ineligible: ineligible.names,
    ineligibleReasons: ineligible.reasons,
    runtimeGlobalAliases,
    dynamicNameRiskIdentifiers,
    publicContractIdentifiers
  };
}

function extractDeclarationBindings(sanitized: string): SymbolBinding[] {
  const bindings: SymbolBinding[] = [];

  const lexicalAndClassPattern = /\b(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of sanitized.matchAll(lexicalAndClassPattern)) {
    const name = match[1];
    const index = match.index ?? 0;
    bindings.push({ name, index, kind: "declaration" });
  }

  const functionPattern = /\b(?:async\s+)?function(?:\s*\*)?\s+([A-Za-z_$][\w$]*)/g;
  for (const match of sanitized.matchAll(functionPattern)) {
    const name = match[1];
    const index = match.index ?? 0;
    bindings.push({ name, index, kind: "declaration" });
  }

  return bindings;
}

function extractImportBindings(sanitized: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const statementPattern = /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gm;
  for (const match of sanitized.matchAll(statementPattern)) {
    const clause = match[1]?.trim() ?? "";
    const source = (match[2] ?? "").trim();
    if (!clause || !source) {
      continue;
    }
    const statementStart = match.index ?? 0;
    bindings.push(...parseImportClause(clause, source, statementStart));
  }
  return bindings;
}

function parseImportClause(clause: string, source: string, statementStart: number): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  let offset = 0;

  const namedSectionMatch = clause.match(/\{([\s\S]*?)\}/);
  const namedSection = namedSectionMatch?.[1] ?? "";
  const beforeNamed = namedSectionMatch ? clause.slice(0, namedSectionMatch.index ?? 0).trim() : clause.trim();

  const defaultOrNamespace = beforeNamed.replace(/,$/, "").trim();
  if (defaultOrNamespace && !defaultOrNamespace.startsWith("*") && !defaultOrNamespace.includes("{")) {
    const local = normalizeIdentifier(defaultOrNamespace);
    if (local) {
      bindings.push({ local, imported: "default", source, index: statementStart + offset });
    }
    offset += 1;
  }

  const namespaceMatch = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch) {
    bindings.push({
      local: namespaceMatch[1],
      imported: "*",
      source,
      index: statementStart + offset
    });
    offset += 1;
  }

  if (namedSection.length > 0) {
    for (const rawPart of namedSection.split(",")) {
      const part = rawPart.trim();
      if (!part) {
        continue;
      }
      const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!aliasMatch) {
        continue;
      }
      const imported = aliasMatch[1];
      const local = aliasMatch[2] ?? aliasMatch[1];
      bindings.push({ local, imported, source, index: statementStart + offset });
      offset += 1;
    }
  }

  return bindings;
}

function extractExportBindings(sanitized: string): ExportBinding[] {
  const bindings: ExportBinding[] = [];

  const declarationPattern = /^\s*export\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of sanitized.matchAll(declarationPattern)) {
    const local = match[1];
    const index = match.index ?? 0;
    bindings.push({ local, exported: local, index });
  }

  const namedPattern = /^\s*export\s*\{([^}]*)\}\s*;?/gm;
  for (const match of sanitized.matchAll(namedPattern)) {
    const body = match[1] ?? "";
    const index = match.index ?? 0;
    let offset = 0;
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      if (!part) {
        continue;
      }
      const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!aliasMatch) {
        continue;
      }
      const local = aliasMatch[1];
      const exported = aliasMatch[2] ?? aliasMatch[1];
      bindings.push({ local, exported, index: index + offset });
      offset += 1;
    }
  }

  const defaultIdentifierPattern =
    /^\s*export\s+default\s+(?!async\b)(?!function\b)(?!class\b)([A-Za-z_$][\w$]*)\s*(?:;|$)/gm;
  for (const match of sanitized.matchAll(defaultIdentifierPattern)) {
    const local = match[1];
    const index = match.index ?? 0;
    bindings.push({ local, exported: "default", index });
  }

  const defaultFunctionPattern =
    /^\s*export\s+default\s+(?:async\s+)?function(?:\s*\*)?\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  for (const match of sanitized.matchAll(defaultFunctionPattern)) {
    const local = match[1];
    const index = match.index ?? 0;
    bindings.push({ local, exported: "default", index });
  }

  const defaultClassPattern = /^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)\b/gm;
  for (const match of sanitized.matchAll(defaultClassPattern)) {
    const local = match[1];
    const index = match.index ?? 0;
    bindings.push({ local, exported: "default", index });
  }

  return bindings;
}

function collectIneligibleNames(code: string, bindings: SymbolBinding[]): {
  names: string[];
  reasons: Record<string, string[]>;
} {
  const reasons = new Map<string, Set<string>>();
  const addReason = (name: string, reason: string): void => {
    if (!reasons.has(name)) {
      reasons.set(name, new Set<string>());
    }
    reasons.get(name)?.add(reason);
  };

  // String-key computed member access can indicate reflective name usage: obj["name"]
  const withCommentsStripped = stripJsComments(code);
  const computedStringKeyPattern = /\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g;
  for (const match of withCommentsStripped.matchAll(computedStringKeyPattern)) {
    addReason(match[1], "computed-string-key");
  }

  for (const name of extractObjectShorthandNames(withCommentsStripped)) {
    addReason(name, "object-shorthand");
  }

  for (const name of extractSimpleObjectDestructuringBindings(withCommentsStripped)) {
    addReason(name, "object-destructuring");
  }

  const counts = new Map<string, number>();
  for (const binding of bindings) {
    counts.set(binding.name, (counts.get(binding.name) ?? 0) + 1);
  }
  for (const [name, count] of counts.entries()) {
    if (count > 1) {
      addReason(name, "duplicate-binding");
    }
  }

  const sortedNames = [...reasons.keys()].sort((left, right) => left.localeCompare(right));
  const sortedReasons: Record<string, string[]> = {};
  for (const name of sortedNames) {
    sortedReasons[name] = [...(reasons.get(name) ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
  }

  return {
    names: sortedNames,
    reasons: sortedReasons
  };
}

function extractObjectShorthandNames(code: string): string[] {
  const names = new Set<string>();
  const objectLiteralPattern = /(?:^|[=(:[,?]|\breturn\b)\s*\{([^{}]*)\}/g;
  for (const match of code.matchAll(objectLiteralPattern)) {
    const body = match[1] ?? "";
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      if (!part) {
        continue;
      }
      if (/^\.{3}/.test(part) || part.includes(":") || /[([{]/.test(part) || /=>/.test(part)) {
        continue;
      }
      const identifierMatch = part.match(/^([A-Za-z_$][\w$]*)$/);
      if (identifierMatch) {
        names.add(identifierMatch[1]);
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function extractSimpleObjectDestructuringBindings(code: string): string[] {
  const names = new Set<string>();
  const declarationPattern = /\b(?:const|let|var)\s*\{([^{}]*)\}\s*=/g;
  const assignmentPattern = /(?:^|[;(])\s*\{([^{}]*)\}\s*=/g;

  const collectFromBody = (body: string): void => {
    for (const rawPart of body.split(",")) {
      const part = rawPart.trim();
      if (!part) {
        continue;
      }
      if (part.startsWith("...")) {
        const restName = part.slice(3).trim();
        if (/^[A-Za-z_$][\w$]*$/.test(restName)) {
          names.add(restName);
        }
        continue;
      }

      const rhs = part.includes(":") ? (part.split(":").slice(1).join(":").trim()) : part;
      if (!rhs || /[[{]/.test(rhs)) {
        continue;
      }

      const localName = rhs.split("=")[0]?.trim() ?? "";
      if (/^[A-Za-z_$][\w$]*$/.test(localName)) {
        names.add(localName);
      }
    }
  };

  for (const match of code.matchAll(declarationPattern)) {
    const body = match[1] ?? "";
    collectFromBody(body);
  }

  for (const match of code.matchAll(assignmentPattern)) {
    const body = match[1] ?? "";
    collectFromBody(body);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function stripJsCommentsAndStrings(code: string): string {
  let output = "";
  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaping = false;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        output += "  ";
        index += 1;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      if (escaping) {
        escaping = false;
        output += " ";
        continue;
      }
      if (char === "\\") {
        escaping = true;
        output += " ";
        continue;
      }
      if ((inSingle && char === "'") || (inDouble && char === '"') || (inTemplate && char === "`")) {
        inSingle = false;
        inDouble = false;
        inTemplate = false;
      }
      output += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      output += " ";
      continue;
    }
    if (char === '"') {
      inDouble = true;
      output += " ";
      continue;
    }
    if (char === "`") {
      inTemplate = true;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

function stripJsComments(code: string): string {
  let output = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1] ?? "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        output += "  ";
        index += 1;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function createEmptyPublicContractMap(): Record<PublicContractSurfaceKind, string[]> {
  return {
    url: [],
    queryKey: [],
    routeName: [],
    eventKey: [],
    jsonField: []
  };
}

function extractRuntimeGlobalAliases(
  sanitizedCode: string,
  knownRuntimeGlobals: Set<string>,
  bindingNames: Set<string>
): string[] {
  const aliases = new Set<string>();
  const aliasPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\b/g;
  for (const match of sanitizedCode.matchAll(aliasPattern)) {
    const local = match[1] ?? "";
    const source = match[2] ?? "";
    if (!local || !source || !bindingNames.has(local)) {
      continue;
    }
    if (knownRuntimeGlobals.has(source)) {
      aliases.add(local);
    }
  }

  return [...aliases].sort((left, right) => left.localeCompare(right));
}

function extractDynamicNameRiskIdentifiers(code: string, bindingNames: Set<string>): string[] {
  const risks = new Set<string>();
  const commentsStripped = stripJsComments(code);

  const computedMemberPattern = /\b([A-Za-z_$][\w$]*)\s*\[\s*([^\]]+?)\s*\]/g;
  for (const match of commentsStripped.matchAll(computedMemberPattern)) {
    const base = match[1] ?? "";
    const memberExpression = (match[2] ?? "").trim();
    if (!memberExpression) {
      continue;
    }
    if (bindingNames.has(base) && !isStaticPropertyExpression(memberExpression)) {
      risks.add(base);
    }
    for (const identifier of extractIdentifierMentions(memberExpression)) {
      if (bindingNames.has(identifier)) {
        risks.add(identifier);
      }
    }
  }

  const reflectPattern = /\bReflect\s*\.\s*(?:get|set|has|deleteProperty)\s*\(([^)]*)\)/g;
  for (const match of commentsStripped.matchAll(reflectPattern)) {
    const args = splitTopLevelArgs(match[1] ?? "");
    if (args.length < 2) {
      continue;
    }
    for (const identifier of extractIdentifierMentions(args[0] ?? "")) {
      if (bindingNames.has(identifier)) {
        risks.add(identifier);
      }
    }
    if (!isStaticPropertyExpression(args[1] ?? "")) {
      for (const identifier of extractIdentifierMentions(args[1] ?? "")) {
        if (bindingNames.has(identifier)) {
          risks.add(identifier);
        }
      }
    }
  }

  const ownPropertyPattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*hasOwnProperty\s*\(([^)]*)\)/g;
  for (const match of commentsStripped.matchAll(ownPropertyPattern)) {
    const base = match[1] ?? "";
    const memberExpression = (match[2] ?? "").trim();
    if (bindingNames.has(base) && memberExpression && !isStaticPropertyExpression(memberExpression)) {
      risks.add(base);
    }
    for (const identifier of extractIdentifierMentions(memberExpression)) {
      if (bindingNames.has(identifier)) {
        risks.add(identifier);
      }
    }
  }

  return [...risks].sort((left, right) => left.localeCompare(right));
}

function extractPublicContractIdentifiers(code: string): Record<PublicContractSurfaceKind, string[]> {
  const surfaceKinds = new Map<PublicContractSurfaceKind, Set<string>>([
    ["url", new Set<string>()],
    ["queryKey", new Set<string>()],
    ["routeName", new Set<string>()],
    ["eventKey", new Set<string>()],
    ["jsonField", new Set<string>()]
  ]);

  const commentsStripped = stripJsComments(code);

  const stringPattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const match of commentsStripped.matchAll(stringPattern)) {
    const literal = match[2] ?? "";
    if (isLikelyUrlLiteral(literal)) {
      const urlLike = surfaceKinds.get("url");
      for (const token of extractIdentifierMentions(literal)) {
        urlLike?.add(token);
      }
      const queryKeys = extractQueryKeysFromUrl(literal);
      const queryKeySet = surfaceKinds.get("queryKey");
      for (const key of queryKeys) {
        queryKeySet?.add(key);
      }
    }
  }

  const routePattern = /\b(?:name|route|routeName)\s*:\s*["'`]([A-Za-z_$][\w$-]*)["'`]/g;
  for (const match of commentsStripped.matchAll(routePattern)) {
    surfaceKinds.get("routeName")?.add(match[1]);
  }

  const eventPattern =
    /\b(?:addEventListener|removeEventListener|dispatchEvent|emit|on|off)\s*\(\s*["'`]([A-Za-z_$][\w$-]*)["'`]/g;
  for (const match of commentsStripped.matchAll(eventPattern)) {
    surfaceKinds.get("eventKey")?.add(match[1]);
  }

  const queryMethodPattern =
    /\b[A-Za-z_$][\w$]*\s*\.\s*(?:get|set|append|has|delete)\s*\(\s*["'`]([A-Za-z_$][\w$-]*)["'`]/g;
  for (const match of commentsStripped.matchAll(queryMethodPattern)) {
    surfaceKinds.get("queryKey")?.add(match[1]);
  }

  const jsonKeyPattern = /(?:\{|,)\s*(?:["'`]([A-Za-z_$][\w$]*)["'`]|([A-Za-z_$][\w$]*))\s*:/g;
  for (const match of commentsStripped.matchAll(jsonKeyPattern)) {
    const key = match[1] ?? match[2] ?? "";
    if (!key) {
      continue;
    }
    surfaceKinds.get("jsonField")?.add(key);
  }

  return {
    url: [...(surfaceKinds.get("url") ?? new Set<string>())].sort((left, right) => left.localeCompare(right)),
    queryKey: [...(surfaceKinds.get("queryKey") ?? new Set<string>())].sort((left, right) => left.localeCompare(right)),
    routeName: [...(surfaceKinds.get("routeName") ?? new Set<string>())].sort((left, right) => left.localeCompare(right)),
    eventKey: [...(surfaceKinds.get("eventKey") ?? new Set<string>())].sort((left, right) => left.localeCompare(right)),
    jsonField: [...(surfaceKinds.get("jsonField") ?? new Set<string>())].sort((left, right) => left.localeCompare(right))
  };
}

function isLikelyUrlLiteral(value: string): boolean {
  return /https?:\/\//.test(value) || /\/\w/.test(value) || /\?[^\s=&]+=/.test(value);
}

function extractQueryKeysFromUrl(value: string): string[] {
  const keys = new Set<string>();
  const queryKeyPattern = /[?&]([A-Za-z_$][\w$-]*)\s*=/g;
  for (const match of value.matchAll(queryKeyPattern)) {
    keys.add(match[1]);
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function isStaticPropertyExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return true;
  }
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return !trimmed.includes("${");
  }
  return /^\d+$/.test(trimmed);
}

function extractIdentifierMentions(expression: string): string[] {
  const names = new Set<string>();
  const pattern = /\b([A-Za-z_$][\w$]*)\b/g;
  for (const match of expression.matchAll(pattern)) {
    names.add(match[1]);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaping = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaping = true;
      continue;
    }

    if (inSingle) {
      current += char;
      if (char === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      current += char;
      if (char === "\"") {
        inDouble = false;
      }
      continue;
    }
    if (inTemplate) {
      current += char;
      if (char === "`") {
        inTemplate = false;
      }
      continue;
    }

    if (char === "'") {
      inSingle = true;
      current += char;
      continue;
    }
    if (char === "\"") {
      inDouble = true;
      current += char;
      continue;
    }
    if (char === "`") {
      inTemplate = true;
      current += char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args;
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    return trimmed;
  }
  return "";
}