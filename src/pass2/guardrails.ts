import type { PipelineAsset } from "../core/types";
import type { SymbolGraph } from "../graph/symbol-graph";
import { isReservedName, type ReservedState } from "../policy/reserved";
import type { RenamePlan } from "./naming-engine";

export interface GuardrailResult {
  diagnostics: string[];
  violated: boolean;
}

export function evaluateGuardrails(
  assets: PipelineAsset[],
  graph: SymbolGraph,
  plan: RenamePlan,
  reserved: ReservedState,
  strictMode: boolean,
  detectDynamicNameAccess: boolean,
  abortOnDynamicNameAccessRisk: boolean,
  abortOnDynamicEvalRisk: boolean,
  abortOnCollision: boolean
): GuardrailResult {
  const diagnostics: string[] = [];

  if (abortOnCollision) {
    const seenTargets = new Map<string, string>();
    const seenSources = new Set<string>();
    for (const entry of plan.entries) {
      const scopedSource = `${entry.file}:${entry.from}`;
      if (seenSources.has(scopedSource)) {
        diagnostics.push(
          `[GUARD_DUPLICATE_SOURCE] Duplicate rename source '${entry.from}' in ${entry.file}`
        );
      }
      seenSources.add(scopedSource);

      const targetScope = `${entry.file}:${entry.to}`;
      const existingSource = seenTargets.get(targetScope);
      if (existingSource && existingSource !== scopedSource) {
        diagnostics.push(
          `[GUARD_COLLISION] Rename target '${entry.to}' in ${entry.file} used by both '${existingSource}' and '${scopedSource}'`
        );
      }
      seenTargets.set(targetScope, scopedSource);

      const existingGlobalAliasSource = seenTargets.get(`global:${entry.to}`);
      if (entry.mode === "identifier" && entry.runtimeGlobalAlias) {
        if (existingGlobalAliasSource && existingGlobalAliasSource !== scopedSource) {
          diagnostics.push(
            `[GUARD_RUNTIME_GLOBAL_TARGET_REUSE] Runtime-global target '${entry.to}' reused by '${existingGlobalAliasSource}' and '${scopedSource}'`
          );
        }
        seenTargets.set(`global:${entry.to}`, scopedSource);
      } else if (entry.mode === "identifier" && existingGlobalAliasSource) {
        diagnostics.push(
          `[GUARD_RUNTIME_GLOBAL_TARGET_REUSE] Runtime-global target '${entry.to}' reused by unrelated symbol '${scopedSource}'`
        );
      }

      if (isReservedName(entry.from, reserved)) {
        diagnostics.push(`[GUARD_RESERVED_SOURCE] Rename source is reserved: '${entry.from}'`);
      }

      if (isReservedName(entry.to, reserved)) {
        diagnostics.push(`[GUARD_RESERVED_TARGET] Rename target is reserved: '${entry.to}'`);
      }

      if (entry.mode === "selector" && entry.selectorKind) {
        const selectorScope = `${entry.file}:${entry.selectorKind}:${entry.to}`;
        const existingSelectorSource = seenTargets.get(selectorScope);
        if (existingSelectorSource && existingSelectorSource !== scopedSource) {
          diagnostics.push(
            `[PASS2_CROSS_ASSET_COLLISION] ${entry.file} :: ${entry.selectorKind}:${entry.from} -> ${entry.to}`
          );
        }
        seenTargets.set(selectorScope, scopedSource);
      }
    }
  }

  if (detectDynamicNameAccess && abortOnDynamicNameAccessRisk) {
    for (const file of graph.files) {
      for (const symbol of graph.dynamicNameRiskByFile[file] ?? []) {
        diagnostics.push(
          `[PASS2_DYNAMIC_NAME_ACCESS_DETECTED] ${file} :: ${symbol}`
        );
      }
    }
  }

  for (const asset of assets) {
    if (asset.type !== "js") {
      continue;
    }
    if (hasUnsupportedRenamePattern(asset.code)) {
      diagnostics.push(
        `[PASS2_UNSUPPORTED_PATTERN] Unsupported syntax for safe rename detected in ${asset.relativePath}`
      );
    }
    if (hasUnsupportedDestructuringPattern(asset.code)) {
      diagnostics.push(
        `[PASS2_UNSUPPORTED_DESTRUCTURING] Unsupported object destructuring form detected in ${asset.relativePath}`
      );
    }
    if (hasUnsupportedNamespaceDynamicMemberPattern(asset.code)) {
      diagnostics.push(
        `[PASS2_UNSUPPORTED_NAMESPACE_DYNAMIC_MEMBER] Unsupported namespace dynamic member access detected in ${asset.relativePath}`
      );
    }
    if (hasUnsupportedCrossAssetSelectorPattern(asset.code)) {
      diagnostics.push(
        `[PASS2_CROSS_ASSET_UNSUPPORTED_SELECTOR] ${asset.relativePath} :: unsupported document selector call`
      );
    }
  }

  if (abortOnDynamicEvalRisk) {
    for (const asset of assets) {
      if (asset.type === "js" && hasDynamicExecutionRisk(asset.code)) {
        diagnostics.push(
          `[GUARD_DYNAMIC_EVAL] Dynamic code execution risk detected in ${asset.relativePath}`
        );
      }
    }
  }

  return {
    diagnostics: dedupeAndSortDiagnostics(diagnostics),
    violated: strictMode && diagnostics.length > 0
  };
}

function dedupeAndSortDiagnostics(diagnostics: string[]): string[] {
  return [...new Set(diagnostics)].sort((left, right) => left.localeCompare(right));
}

function hasDynamicExecutionRisk(code: string): boolean {
  const patterns = [/\beval\s*\(/, /\bFunction\s*\(/, /\bsetTimeout\s*\(\s*["'`]/, /\bsetInterval\s*\(\s*["'`]/];
  return patterns.some((pattern) => pattern.test(code));
}

function hasUnsupportedRenamePattern(code: string): boolean {
  const patterns = [/\bwith\s*\(/, /\btry\s*\{[\s\S]*?\bcatch\s*\(\s*\{/, /\bclass\s+[A-Za-z_$][\w$]*/];
  return patterns.some((pattern) => pattern.test(code));
}

function hasUnsupportedDestructuringPattern(code: string): boolean {
  const patterns = [
    /\b(?:const|let|var)\s*\{[^}]*\{[^}]*\}[^}]*\}\s*=/,
    /\b(?:const|let|var)\s*\{[^}]*\[[^\]]*\][^}]*\}\s*=/,
    /\b(?:const|let|var)\s*\{[^}]*\.\.\.[A-Za-z_$][\w$]*[^}]*\}\s*=/
  ];
  return patterns.some((pattern) => pattern.test(code));
}

function hasUnsupportedNamespaceDynamicMemberPattern(code: string): boolean {
  const commentsStripped = stripJsComments(code);
  const namespaceLocals = extractNamespaceImportLocals(commentsStripped);
  if (namespaceLocals.length === 0) {
    return false;
  }

  for (const namespaceLocal of namespaceLocals) {
    const dynamicMemberPattern = new RegExp(`\\b${escapeRegExp(namespaceLocal)}\\s*\\[\\s*([^\\]]+)\\]`, "g");
    for (const match of commentsStripped.matchAll(dynamicMemberPattern)) {
      const memberExpression = (match[1] ?? "").trim();
      if (!memberExpression) {
        continue;
      }
      if (isStaticallyKnownMemberExpression(memberExpression)) {
        continue;
      }
      return true;
    }
  }

  return false;
}

function extractNamespaceImportLocals(code: string): string[] {
  const namespaceLocals = new Set<string>();
  const namespaceImportPattern = /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["']\s*;?/gm;
  for (const match of code.matchAll(namespaceImportPattern)) {
    const local = match[1] ?? "";
    if (local) {
      namespaceLocals.add(local);
    }
  }

  return [...namespaceLocals].sort((left, right) => left.localeCompare(right));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isStaticallyKnownMemberExpression(memberExpression: string): boolean {
  // Plain string literals are static member reads and do not need this guardrail.
  if ((memberExpression.startsWith("\"") && memberExpression.endsWith("\"")) || (memberExpression.startsWith("'") && memberExpression.endsWith("'"))) {
    return true;
  }

  // Template literals are static only when they have no interpolation.
  if (memberExpression.startsWith("`") && memberExpression.endsWith("`")) {
    return !memberExpression.includes("${");
  }

  return false;
}

function hasUnsupportedCrossAssetSelectorPattern(code: string): boolean {
  const commentsStripped = stripJsComments(code);
  const callPattern = /\bdocument\s*\.\s*(getElementById|getElementsByClassName|querySelector|querySelectorAll)\s*\(([^)]*)\)/g;
  for (const match of commentsStripped.matchAll(callPattern)) {
    const api = match[1] ?? "";
    const rawArg = (match[2] ?? "").trim();

    const parsed = parseStaticStringArg(rawArg);
    if (!parsed) {
      return true;
    }

    if ((api === "getElementById" || api === "getElementsByClassName") && !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(parsed)) {
      return true;
    }

    if ((api === "querySelector" || api === "querySelectorAll") && !/^[.#][A-Za-z_][A-Za-z0-9_-]*$/.test(parsed)) {
      return true;
    }
  }

  return false;
}

function parseStaticStringArg(raw: string): string | null {
  if (raw.length < 2) {
    return null;
  }
  const quote = raw[0];
  if ((quote !== "\"" && quote !== "'" && quote !== "`") || raw[raw.length - 1] !== quote) {
    return null;
  }
  const inner = raw.slice(1, -1);
  if (quote === "`" && inner.includes("${")) {
    return null;
  }
  if (inner.includes("\\")) {
    return null;
  }
  return inner;
}