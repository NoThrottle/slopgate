import type { PipelineAsset, PipelineContext } from "../core/types";
import type { SelectorKind } from "../graph/cross-asset-links";
import type { SymbolGraph } from "../graph/symbol-graph";
import type { PublicContractSurfaceKind } from "../api/types";
import { isReservedCssClass, isReservedName, type ReservedState } from "../policy/reserved";
import { rewriteCssSelectors, type SelectorRenameMap } from "./rewrite-css";
import { rewriteHtmlSelectors } from "./rewrite-html";
import { allocateDeterministicUniqueName, generateDeterministicName } from "./rename-strategy";

export interface RenamePlanEntry {
  file: string;
  from: string;
  to: string;
  mode: "identifier" | "selector";
  selectorKind?: SelectorKind;
  runtimeGlobalAlias?: boolean;
}

export interface RenamePlan {
  entries: RenamePlanEntry[];
  diagnostics: string[];
}

export function createRenamePlan(
  graph: SymbolGraph,
  context: PipelineContext,
  reserved: ReservedState
): RenamePlan {
  const diagnostics: string[] = [];
  const entries: RenamePlanEntry[] = [];
  const preservePublicAPI = context.config.pass2.preservePublicAPI;
  diagnostics.push(...graph.crossAssetDiagnostics);
  const exportsByFile = graph.exportsByFile;
  const exportLocalsByFile = new Map<string, Set<string>>();
  for (const file of graph.files) {
    exportLocalsByFile.set(
      file,
      new Set((exportsByFile[file] ?? []).map((entry) => entry.local))
    );
  }

  const namespaceProtectedKeys = collectNamespaceProtectedKeys(graph);
  const jsGrouping = buildRenameGroups(graph);
  diagnostics.push(...jsGrouping.diagnostics);
  const selectorGrouping = buildSelectorRenameGroups(graph);
  diagnostics.push(...selectorGrouping.diagnostics);

  const groups: Array<
    | { type: "identifier"; symbol: string; members: Array<{ file: string; name: string }> }
    | {
        type: "selector";
        symbol: string;
        kind: SelectorKind;
        members: Array<{ file: string; name: string; assetType: PipelineAsset["type"] }>;
      }
  > = [
    ...jsGrouping.groups.map((group) => ({ type: "identifier" as const, symbol: group.symbol, members: group.members })),
    ...selectorGrouping.groups.map((group) => ({
      type: "selector" as const,
      symbol: group.symbol,
      kind: group.kind,
      members: group.members
    }))
  ].sort((left, right) => {
    const leftFile = left.members[0]?.file ?? "";
    const rightFile = right.members[0]?.file ?? "";
    return leftFile.localeCompare(rightFile) || left.symbol.localeCompare(right.symbol) || left.type.localeCompare(right.type);
  });

  const selectorNamesByFile = buildSelectorNameIndex(graph);
  const runtimeGlobalKeys = collectRuntimeGlobalKeys(graph);
  const dynamicRiskKeys = collectDynamicRiskKeys(graph);
  const rewritePublicContractSurfaces = context.config.pass2.rewritePublicContractSurfaces ?? false;
  const enabledPublicContractSurfaceKinds = new Set<PublicContractSurfaceKind>(
    context.config.pass2.publicContractSurfaceKinds ?? []
  );
  const usedIdentifierTargets = collectExistingBindingNames(graph);
  let index = 0;

  for (const group of groups) {
    if (group.type === "selector") {
      if (group.kind === "class" && isReservedCssClass(group.symbol, reserved)) {
        continue;
      }

      const target = generateDeterministicName(context.normalizedSeed, index);
      index += 1;

      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(target)) {
        continue;
      }

      const collisions = findSelectorCollisions(selectorNamesByFile, group, target);
      if (collisions.length > 0) {
        diagnostics.push(...collisions);
        continue;
      }

      for (const member of group.members) {
        entries.push({
          file: member.file,
          from: member.name,
          to: target,
          mode: "selector",
          selectorKind: group.kind
        });
      }
      continue;
    }

    const runtimeGlobalGroup = group.members.some((member) => runtimeGlobalKeys.has(toGroupKey(member.file, member.name)));
    const dynamicRiskGroup = group.members.some((member) => dynamicRiskKeys.has(toGroupKey(member.file, member.name)));

    const namespaceProtectedMember = group.members.find((member) =>
      namespaceProtectedKeys.has(toGroupKey(member.file, member.name))
    );
    if (namespaceProtectedMember) {
      diagnostics.push(
        `[PASS2_RENAME_SKIPPED_NAMESPACE_LINKAGE] Skipped '${group.symbol}' due to namespace import consumer usage`
      );
      continue;
    }

    if (dynamicRiskGroup) {
      diagnostics.push(
        `[PASS2_RENAME_SKIPPED_DYNAMIC_ACCESS] Skipped '${group.symbol}' due to dynamic-name access linkage`
      );
      continue;
    }

    const ineligibleMembers = group.members.filter((member) =>
      (graph.ineligibleByFile[member.file] ?? []).includes(member.name)
    );
    if (ineligibleMembers.length > 0) {
      const reasonCodes = new Set<string>();
      for (const member of ineligibleMembers) {
        const reasonsByName = graph.ineligibleReasonsByFile[member.file] ?? {};
        for (const reasonCode of reasonsByName[member.name] ?? []) {
          reasonCodes.add(reasonCode);
        }
      }

      if (reasonCodes.has("object-shorthand")) {
        diagnostics.push(
          `[PASS2_RENAME_SKIPPED_SHORTHAND] Skipped '${group.symbol}' due to object shorthand usage`
        );
      }
      if (reasonCodes.has("object-destructuring")) {
        diagnostics.push(
          `[PASS2_RENAME_SKIPPED_DESTRUCTURING] Skipped '${group.symbol}' due to object destructuring usage`
        );
      }
      diagnostics.push(
        `[PASS2_RENAME_SKIPPED_INELIGIBLE] Skipped '${group.symbol}' due to ineligible pattern usage`
      );
      continue;
    }

    const preserveByExport =
      preservePublicAPI &&
      group.members.some((member) => (exportLocalsByFile.get(member.file) ?? new Set<string>()).has(member.name));
    if (preserveByExport) {
      continue;
    }

    if (isReservedName(group.symbol, reserved)) {
      continue;
    }

    const contractSurfaceKinds = collectContractKindsForGroup(graph, group.members);
    if (contractSurfaceKinds.length > 0) {
      const allowedKinds = contractSurfaceKinds.filter((kind) => enabledPublicContractSurfaceKinds.has(kind));
      const allKindsEnabled =
        rewritePublicContractSurfaces && allowedKinds.length === contractSurfaceKinds.length;
      if (!allKindsEnabled) {
        const joinedKinds = contractSurfaceKinds.join(",");
        diagnostics.push(
          `[PASS2_PUBLIC_CONTRACT_PRESERVED] Preserved '${group.symbol}' due to public contract surfaces: ${joinedKinds}`
        );
        if (!rewritePublicContractSurfaces) {
          diagnostics.push(
            `[PASS2_PUBLIC_CONTRACT_OPT_IN_REQUIRED] Skipped '${group.symbol}' until pass2.rewritePublicContractSurfaces is enabled`
          );
        }
        continue;
      }
    }

    const allocation = allocateDeterministicUniqueName(
      context.normalizedSeed,
      index,
      usedIdentifierTargets,
      context.config.pass2.identifierStyle,
      {
        dictionaryWords: context.config.pass2.semanticTokenDictionaryWords,
        includeBuiltInVocabulary: context.config.pass2.semanticTokenIncludeBuiltInVocabulary
      }
    );
    const target = allocation.name;
    index = allocation.nextIndex;
    if (isReservedName(target, reserved)) {
      continue;
    }

    if (runtimeGlobalGroup && allocation.attempts > 1) {
      diagnostics.push(
        `[PASS2_RUNTIME_GLOBAL_TARGET_LOCK] Locked runtime-global alias target '${target}' for '${group.symbol}'`
      );
    }

    for (const member of group.members) {
      if (preservePublicAPI && /^[A-Z]/.test(member.name)) {
        continue;
      }
      entries.push({
        file: member.file,
        from: member.name,
        to: target,
        mode: "identifier",
        runtimeGlobalAlias: runtimeGlobalGroup
      });
    }
  }

  return {
    entries: entries.sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.mode.localeCompare(right.mode) ||
        (left.selectorKind ?? "").localeCompare(right.selectorKind ?? "") ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to)
    ),
    diagnostics: dedupeAndSortDiagnostics(diagnostics)
  };
}

export function applyPass2(
  assets: PipelineAsset[],
  plan: RenamePlan,
  context: PipelineContext
): PipelineAsset[] {
  if (!context.config.pass2.enabled) {
    return assets;
  }

  const identifierByFile = buildIdentifierPlanIndex(plan);
  const selectorByFile = buildSelectorPlanIndex(plan);

  return assets.map((asset) => {
    if (asset.type === "js") {
      const identifierMapping = identifierByFile.get(asset.relativePath);
      const selectorMapping = selectorByFile.get(asset.relativePath);
      if ((!identifierMapping || identifierMapping.size === 0) && !selectorMapping) {
        return asset;
      }

      const rewrittenIdentifiers = identifierMapping ? rewriteJsIdentifiers(asset.code, identifierMapping) : asset.code;
      const rewrittenSelectors = selectorMapping ? rewriteJsStaticSelectors(rewrittenIdentifiers, selectorMapping) : rewrittenIdentifiers;

      return {
        ...asset,
        code: rewrittenSelectors
      };
    }

    const selectorMapping = selectorByFile.get(asset.relativePath);
    if (!selectorMapping) {
      return asset;
    }

    if (asset.type === "css") {
      return {
        ...asset,
        code: rewriteCssSelectors(asset.code, selectorMapping)
      };
    }

    return {
      ...asset,
      code: rewriteHtmlSelectors(asset.code, selectorMapping)
    };
  });
}

function collectExistingBindingNames(graph: SymbolGraph): Set<string> {
  const names = new Set<string>();

  for (const file of graph.files) {
    for (const binding of graph.bindingsByFile[file] ?? []) {
      names.add(binding.name);
    }
  }

  return names;
}

function buildSelectorRenameGroups(graph: SymbolGraph): {
  groups: Array<{
    symbol: string;
    kind: SelectorKind;
    members: Array<{ file: string; name: string; assetType: PipelineAsset["type"] }>;
  }>;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const groups = new Map<string, Array<{ file: string; name: string; assetType: PipelineAsset["type"] }>>();

  for (const file of graph.files) {
    for (const ref of graph.selectorRefsByFile[file] ?? []) {
      const key = `${ref.kind}\u0000${ref.name}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push({ file: ref.file, name: ref.name, assetType: ref.assetType });
    }
  }

  const output: Array<{
    symbol: string;
    kind: SelectorKind;
    members: Array<{ file: string; name: string; assetType: PipelineAsset["type"] }>;
  }> = [];

  for (const [key, members] of groups.entries()) {
    const [kind, symbol] = key.split("\u0000") as [SelectorKind, string];
    const sortedMembers = members.sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.assetType.localeCompare(right.assetType) ||
        left.name.localeCompare(right.name)
    );

    const hasJs = sortedMembers.some((member) => member.assetType === "js");
    const hasLinkedAsset = sortedMembers.some((member) => member.assetType === "html" || member.assetType === "css");

    if (!hasJs) {
      continue;
    }

    if (!hasLinkedAsset) {
      for (const member of sortedMembers.filter((entry) => entry.assetType === "js")) {
        diagnostics.push(
          `[PASS2_CROSS_ASSET_UNRESOLVED] ${member.file} :: ${kind}:${member.name}`
        );
      }
      continue;
    }

    output.push({
      symbol,
      kind,
      members: sortedMembers
    });
  }

  return {
    groups: output.sort(
      (left, right) =>
        left.members[0].file.localeCompare(right.members[0].file) ||
        left.kind.localeCompare(right.kind) ||
        left.symbol.localeCompare(right.symbol)
    ),
    diagnostics: dedupeAndSortDiagnostics(diagnostics)
  };
}

function buildSelectorNameIndex(graph: SymbolGraph): Map<string, Record<SelectorKind, Set<string>>> {
  const index = new Map<string, Record<SelectorKind, Set<string>>>();

  for (const file of graph.files) {
    const bucket: Record<SelectorKind, Set<string>> = {
      class: new Set<string>(),
      id: new Set<string>()
    };
    for (const ref of graph.selectorRefsByFile[file] ?? []) {
      bucket[ref.kind].add(ref.name);
    }
    index.set(file, bucket);
  }

  return index;
}

function findSelectorCollisions(
  selectorNamesByFile: Map<string, Record<SelectorKind, Set<string>>>,
  group: {
    kind: SelectorKind;
    symbol: string;
    members: Array<{ file: string; name: string; assetType: PipelineAsset["type"] }>;
  },
  target: string
): string[] {
  const collisions: string[] = [];
  const groupNamesByFile = new Map<string, Set<string>>();

  for (const member of group.members) {
    if (!groupNamesByFile.has(member.file)) {
      groupNamesByFile.set(member.file, new Set<string>());
    }
    groupNamesByFile.get(member.file)?.add(member.name);
  }

  for (const member of group.members) {
    const inFile = selectorNamesByFile.get(member.file)?.[group.kind] ?? new Set<string>();
    const namesInGroup = groupNamesByFile.get(member.file) ?? new Set<string>();
    if (inFile.has(target) && !namesInGroup.has(target)) {
      collisions.push(
        `[PASS2_CROSS_ASSET_COLLISION] ${member.file} :: ${group.kind}:${group.symbol} -> ${target}`
      );
    }
  }

  return dedupeAndSortDiagnostics(collisions);
}

function buildRenameGroups(graph: SymbolGraph): {
  groups: Array<{ symbol: string; members: Array<{ file: string; name: string }> }>;
  diagnostics: string[];
} {
  const parent = new Map<string, string>();
  const diagnostics: string[] = [];

  for (const file of graph.files) {
    const bindings = graph.bindingsByFile[file] ?? [];
    for (const binding of bindings) {
      const key = toGroupKey(file, binding.name);
      parent.set(key, key);
    }
  }

  for (const file of graph.files) {
    const imports = graph.importsByFile[file] ?? [];
    for (const importBinding of imports) {
      if (importBinding.imported === "*") {
        continue;
      }
      const targetFile = resolveImportTarget(graph.files, file, importBinding.source);
      if (!targetFile) {
        continue;
      }

      const localKey = toGroupKey(file, importBinding.local);
      const targetName = resolveImportTargetName(graph, targetFile, importBinding.imported);
      if (!targetName) {
        if (importBinding.imported === "default") {
          diagnostics.push(
            `[PASS2_DEFAULT_LINK_UNRESOLVED] Could not resolve default export binding for '${importBinding.source}' imported in ${file}`
          );
        }
        continue;
      }

      const targetKey = toGroupKey(targetFile, targetName);
      if (!parent.has(localKey) || !parent.has(targetKey)) {
        if (importBinding.imported === "default") {
          diagnostics.push(
            `[PASS2_DEFAULT_LINK_UNRESOLVED] Could not resolve default export binding for '${importBinding.source}' imported in ${file}`
          );
        }
        continue;
      }
      unionParents(parent, localKey, targetKey);
    }
  }

  const canonical = new Map<string, Set<string>>();
  for (const key of parent.keys()) {
    const root = findParent(parent, key);
    if (!canonical.has(root)) {
      canonical.set(root, new Set<string>());
    }
    canonical.get(root)?.add(key);
  }

  const result: Array<{ symbol: string; members: Array<{ file: string; name: string }> }> = [];
  for (const members of canonical.values()) {
    const parsedMembers = [...members]
      .map(parseGroupKey)
      .sort((left, right) => left.file.localeCompare(right.file) || left.name.localeCompare(right.name));
    if (parsedMembers.length === 0) {
      continue;
    }
    result.push({ symbol: parsedMembers[0].name, members: parsedMembers });
  }

  return result.sort(
    (left, right) =>
      left.members[0].file.localeCompare(right.members[0].file) ||
      left.symbol.localeCompare(right.symbol)
  ).reduce(
    (accumulator, group) => {
      accumulator.groups.push(group);
      return accumulator;
    },
    {
      groups: [] as Array<{ symbol: string; members: Array<{ file: string; name: string }> }>,
      diagnostics: dedupeAndSortDiagnostics(diagnostics)
    }
  );
}

function resolveImportTargetName(graph: SymbolGraph, targetFile: string, imported: string): string {
  if (imported === "default") {
    const defaultBinding = (graph.exportsByFile[targetFile] ?? []).find((binding) => binding.exported === "default");
    return defaultBinding?.local ?? "";
  }

  return imported;
}

function collectNamespaceProtectedKeys(graph: SymbolGraph): Set<string> {
  const protectedKeys = new Set<string>();

  for (const file of graph.files) {
    const imports = graph.importsByFile[file] ?? [];
    for (const importBinding of imports) {
      if (importBinding.imported !== "*") {
        continue;
      }
      const targetFile = resolveImportTarget(graph.files, file, importBinding.source);
      if (!targetFile) {
        continue;
      }

      const exportBindings = graph.exportsByFile[targetFile] ?? [];
      for (const exportBinding of exportBindings) {
        protectedKeys.add(toGroupKey(targetFile, exportBinding.local));
      }
    }
  }

  return protectedKeys;
}

function dedupeAndSortDiagnostics(diagnostics: string[]): string[] {
  return [...new Set(diagnostics)].sort((left, right) => left.localeCompare(right));
}

function collectRuntimeGlobalKeys(graph: SymbolGraph): Set<string> {
  const keys = new Set<string>();
  for (const file of graph.files) {
    for (const name of graph.runtimeGlobalAliasesByFile[file] ?? []) {
      keys.add(toGroupKey(file, name));
    }
  }
  return keys;
}

function collectDynamicRiskKeys(graph: SymbolGraph): Set<string> {
  const keys = new Set<string>();
  for (const file of graph.files) {
    for (const name of graph.dynamicNameRiskByFile[file] ?? []) {
      keys.add(toGroupKey(file, name));
    }
  }
  return keys;
}

function collectContractKindsForGroup(
  graph: SymbolGraph,
  members: Array<{ file: string; name: string }>
): PublicContractSurfaceKind[] {
  const kinds = new Set<PublicContractSurfaceKind>();
  for (const member of members) {
    const byKind = graph.publicContractNamesByFile[member.file];
    if (!byKind) {
      continue;
    }
    for (const kind of Object.keys(byKind) as PublicContractSurfaceKind[]) {
      if ((byKind[kind] ?? []).includes(member.name)) {
        kinds.add(kind);
      }
    }
  }
  return [...kinds].sort((left, right) => left.localeCompare(right));
}

function resolveImportTarget(files: string[], fromFile: string, source: string): string {
  if (!source.startsWith(".")) {
    return "";
  }

  const fromDir = posixDirname(fromFile);
  const raw = normalizePath(posixJoin(fromDir, source));
  const candidates = [
    raw,
    `${raw}.js`,
    `${raw}.mjs`,
    `${raw}.cjs`,
    `${raw}/index.js`,
    `${raw}/index.mjs`,
    `${raw}/index.cjs`
  ];

  for (const candidate of candidates) {
    if (files.includes(candidate)) {
      return candidate;
    }
  }
  return "";
}


function unionParents(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = findParent(parent, left);
  const rightRoot = findParent(parent, right);
  if (leftRoot === rightRoot) {
    return;
  }
  if (leftRoot.localeCompare(rightRoot) <= 0) {
    parent.set(rightRoot, leftRoot);
  } else {
    parent.set(leftRoot, rightRoot);
  }
}

function findParent(parent: Map<string, string>, key: string): string {
  let current = key;
  while (parent.get(current) && parent.get(current) !== current) {
    current = parent.get(current) ?? current;
  }
  const root = current;
  current = key;
  while (parent.get(current) && parent.get(current) !== current) {
    const next = parent.get(current) ?? current;
    parent.set(current, root);
    current = next;
  }
  return root;
}

function toGroupKey(file: string, name: string): string {
  return `${file}\u0000${name}`;
}

function parseGroupKey(key: string): { file: string; name: string } {
  const [file, name] = key.split("\u0000");
  return { file, name };
}

function buildIdentifierPlanIndex(plan: RenamePlan): Map<string, Map<string, string>> {
  const byFile = new Map<string, Map<string, string>>();
  for (const entry of plan.entries.filter((candidate) => candidate.mode === "identifier")) {
    if (!byFile.has(entry.file)) {
      byFile.set(entry.file, new Map<string, string>());
    }
    byFile.get(entry.file)?.set(entry.from, entry.to);
  }
  return byFile;
}

function buildSelectorPlanIndex(plan: RenamePlan): Map<string, SelectorRenameMap> {
  const byFile = new Map<string, SelectorRenameMap>();
  for (const entry of plan.entries.filter((candidate) => candidate.mode === "selector")) {
    const kind = entry.selectorKind;
    if (!kind) {
      continue;
    }
    if (!byFile.has(entry.file)) {
      byFile.set(entry.file, {
        class: new Map<string, string>(),
        id: new Map<string, string>()
      });
    }
    byFile.get(entry.file)?.[kind].set(entry.from, entry.to);
  }
  return byFile;
}

function rewriteJsStaticSelectors(code: string, mapping: SelectorRenameMap): string {
  let rewritten = code;

  rewritten = rewritten.replace(
    /(document\s*\.\s*getElementById\s*\(\s*)(["'])([A-Za-z_][A-Za-z0-9_-]*)(\2\s*\))/g,
    (full, prefix: string, quote: string, value: string, suffix: string) => {
      const replacement = mapping.id.get(value);
      if (!replacement) {
        return full;
      }
      return `${prefix}${quote}${replacement}${suffix}`;
    }
  );

  rewritten = rewritten.replace(
    /(document\s*\.\s*getElementsByClassName\s*\(\s*)(["'])([A-Za-z_][A-Za-z0-9_-]*)(\2\s*\))/g,
    (full, prefix: string, quote: string, value: string, suffix: string) => {
      const replacement = mapping.class.get(value);
      if (!replacement) {
        return full;
      }
      return `${prefix}${quote}${replacement}${suffix}`;
    }
  );

  rewritten = rewritten.replace(
    /(document\s*\.\s*querySelector(?:All)?\s*\(\s*)(["'])([.#])([A-Za-z_][A-Za-z0-9_-]*)(\2\s*\))/g,
    (full, prefix: string, quote: string, marker: string, value: string, suffix: string) => {
      const kind: SelectorKind = marker === "." ? "class" : "id";
      const replacement = mapping[kind].get(value);
      if (!replacement) {
        return full;
      }
      return `${prefix}${quote}${marker}${replacement}${suffix}`;
    }
  );

  return rewritten;
}

function rewriteJsIdentifiers(code: string, mapping: Map<string, string>): string {
  const tokens = tokenize(code);
  let output = "";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "identifier") {
      output += token.value;
      continue;
    }

    const previous = previousCodeToken(tokens, index);
    const next = nextCodeToken(tokens, index);
    const replacement = mapping.get(token.value);
    if (
      !replacement ||
      isPropertyMember(previous, next) ||
      isObjectLiteralKey(previous, next) ||
      isObjectShorthandOrDestructuringIdentifier(tokens, index)
    ) {
      output += token.value;
      continue;
    }

    output += replacement;
  }

  return output;
}

type JsToken =
  | { type: "identifier"; value: string }
  | { type: "punctuation"; value: string }
  | { type: "string"; value: string }
  | { type: "comment"; value: string }
  | { type: "whitespace"; value: string }
  | { type: "other"; value: string };

function tokenize(code: string): JsToken[] {
  const tokens: JsToken[] = [];
  let index = 0;

  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1] ?? "";

    if (/\s/.test(char)) {
      const start = index;
      while (index < code.length && /\s/.test(code[index])) {
        index += 1;
      }
      tokens.push({ type: "whitespace", value: code.slice(start, index) });
      continue;
    }

    if (char === "/" && next === "/") {
      const start = index;
      index += 2;
      while (index < code.length && code[index] !== "\n") {
        index += 1;
      }
      tokens.push({ type: "comment", value: code.slice(start, index) });
      continue;
    }

    if (char === "/" && next === "*") {
      const start = index;
      index += 2;
      while (index < code.length) {
        if (code[index] === "*" && (code[index + 1] ?? "") === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      tokens.push({ type: "comment", value: code.slice(start, index) });
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      const start = index;
      index += 1;
      let escaping = false;
      while (index < code.length) {
        const current = code[index];
        if (escaping) {
          escaping = false;
          index += 1;
          continue;
        }
        if (current === "\\") {
          escaping = true;
          index += 1;
          continue;
        }
        if (current === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push({ type: "string", value: code.slice(start, index) });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < code.length && isIdentifierPart(code[index])) {
        index += 1;
      }
      tokens.push({ type: "identifier", value: code.slice(start, index) });
      continue;
    }

    if (isPunctuation(char)) {
      tokens.push({ type: "punctuation", value: char });
      index += 1;
      continue;
    }

    tokens.push({ type: "other", value: char });
    index += 1;
  }

  return tokens;
}

function previousCodeToken(tokens: JsToken[], index: number): JsToken | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const token = tokens[cursor];
    if (token.type !== "whitespace" && token.type !== "comment") {
      return token;
    }
  }
  return null;
}

function nextCodeToken(tokens: JsToken[], index: number): JsToken | null {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.type !== "whitespace" && token.type !== "comment") {
      return token;
    }
  }
  return null;
}

function isPropertyMember(previous: JsToken | null, next: JsToken | null): boolean {
  if (previous?.type === "punctuation" && previous.value === ".") {
    return true;
  }
  return previous?.type === "punctuation" && previous.value === "[" && next?.type === "punctuation" && next.value === "]";
}

function isObjectLiteralKey(previous: JsToken | null, next: JsToken | null): boolean {
  if (!(next?.type === "punctuation" && next.value === ":")) {
    return false;
  }
  if (!previous) {
    return true;
  }
  return previous.type === "punctuation" && ["{", ","].includes(previous.value);
}

function isObjectShorthandOrDestructuringIdentifier(tokens: JsToken[], index: number): boolean {
  const previous = previousCodeToken(tokens, index);
  const next = nextCodeToken(tokens, index);

  if (!(previous?.type === "punctuation" && ["{", ",", ":"].includes(previous.value))) {
    return false;
  }
  if (!(next?.type === "punctuation" && [",", "}", "="].includes(next.value))) {
    return false;
  }

  const pair = findNearestBracePair(tokens, index);
  if (!pair) {
    return false;
  }

  const beforeBrace = previousCodeToken(tokens, pair.openIndex);
  if (beforeBrace?.type === "identifier" && ["import", "export"].includes(beforeBrace.value)) {
    return false;
  }

  if (previous.value === ":") {
    return isDestructuringBracePattern(tokens, pair);
  }

  return true;
}

function isDestructuringBracePattern(tokens: JsToken[], pair: { openIndex: number; closeIndex: number }): boolean {
  const beforeBrace = previousCodeToken(tokens, pair.openIndex);
  if (beforeBrace?.type === "identifier" && ["const", "let", "var"].includes(beforeBrace.value)) {
    return true;
  }

  const afterBrace = nextCodeToken(tokens, pair.closeIndex);
  return afterBrace?.type === "punctuation" && afterBrace.value === "=";
}

function findNearestBracePair(tokens: JsToken[], index: number): { openIndex: number; closeIndex: number } | null {
  const stack: number[] = [];
  let containingOpenIndex = -1;
  let containingCloseIndex = -1;

  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (!(token.type === "punctuation" && ["{", "}"].includes(token.value))) {
      continue;
    }
    if (token.value === "{") {
      stack.push(cursor);
      continue;
    }

    const openIndex = stack.pop();
    if (openIndex === undefined) {
      continue;
    }
    if (openIndex < index && cursor > index) {
      containingOpenIndex = openIndex;
      containingCloseIndex = cursor;
    }
  }

  if (containingOpenIndex < 0 || containingCloseIndex < 0) {
    return null;
  }

  return { openIndex: containingOpenIndex, closeIndex: containingCloseIndex };
}

function isIdentifierStart(value: string): boolean {
  return /[A-Za-z_$]/.test(value);
}

function isIdentifierPart(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function isPunctuation(value: string): boolean {
  return "{}[]().,;:=<>+-*/%!?&|^~".includes(value);
}

function posixDirname(filePath: string): string {
  const normalized = normalizePath(filePath);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return ".";
  }
  return normalized.slice(0, index);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function posixJoin(left: string, right: string): string {
  const parts = `${left}/${right}`.split("/");
  const output: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }
  return output.join("/");
}