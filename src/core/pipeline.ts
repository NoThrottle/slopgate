import fs from "node:fs/promises";
import path from "node:path";
import type { ObfuscationResult, ObfuscatorConfig } from "../api/types";
import { createTransformReport, writeJsonReport, writeRunArtifacts } from "../emit/report";
import { writeAssets } from "../emit/writer";
import { buildSourceMapPlaceholders, verifySourceMapConsistency, writeSourceMapFiles } from "../emit/sourcemap";
import { buildSymbolGraph } from "../graph/symbol-graph";
import { checkGraphIntegrity } from "../graph/ref-tracker";
import { parseCss } from "../parsers/css";
import { parseHtml } from "../parsers/html";
import { parseJs } from "../parsers/js";
import { transformCssPass1 } from "../pass1/css-standard";
import { transformHtmlPass1 } from "../pass1/html-standard";
import { transformJsPass1 } from "../pass1/js-standard";
import {
  PASS1_DIAGNOSTIC_TAGS,
  extractDiagnosticTag,
  isInformationalPass1Diagnostic,
  mergeDeterministicDiagnostics
} from "../pass1/pass1-diagnostics";
import { evaluateGuardrails } from "../pass2/guardrails";
import { applyPass2, createRenamePlan } from "../pass2/naming-engine";
import { buildReservedState } from "../policy/reserved";
import { createPipelineContext } from "./context";
import type { PipelineAsset, PipelineContext, PipelineRunOptions } from "./types";

export async function runPipeline(
  config: ObfuscatorConfig,
  options: PipelineRunOptions
): Promise<ObfuscationResult> {
  const mode = options.mode ?? "run";
  const isVerifyMode = mode === "verify";
  const context: PipelineContext = createPipelineContext(config);

  const discovered = await discoverAssets(config);
  const parsed = discovered.map((asset) => {
    const parsedAsset = parseAsset(asset);
    recordStage(context, parsedAsset.relativePath, "parse");
    return parsedAsset;
  });

  const pass1 = parsed.map((asset) => {
    const transformed = transformPass1(asset, context);
    recordStage(context, transformed.relativePath, "pass1");
    return transformed;
  });
  normalizeDiagnostics(context);

  const graph = buildSymbolGraph(pass1, config.safety.reservedGlobals);
  appendDiagnostics(context, checkGraphIntegrity(graph, pass1));
  const reserved = buildReservedState(
    config.safety.reservedNames,
    config.safety.reservedPatterns,
    config.safety.reservedCssClasses
  );
  const renamePlan = createRenamePlan(graph, context, reserved);
  appendDiagnostics(context, renamePlan.diagnostics);
  const guardrail = evaluateGuardrails(
    pass1,
    graph,
    renamePlan,
    reserved,
    config.safety.strictMode,
    config.safety.detectDynamicNameAccess ?? true,
    config.safety.abortOnDynamicNameAccessRisk ?? true,
    config.safety.abortOnDynamicEvalRisk,
    config.safety.abortOnCollision
  );
  appendDiagnostics(context, guardrail.diagnostics);
  if (guardrail.violated || hasStrictBlockingDiagnostics(context.diagnostics, config)) {
    throwSafetyPolicyViolation(context.diagnostics);
  }

  const pass2 = applyPass2(pass1, renamePlan, context).map((asset) => {
    recordStage(context, asset.relativePath, "pass2");
    return asset;
  });

  const maps = config.sourceMaps ? buildSourceMapPlaceholders(pass2) : {};
  const outputFiles = isVerifyMode ? [] : await writeAssets(config, pass2);
  if (!isVerifyMode) {
    await writeSourceMapFiles(config, maps);
  }
  if (config.sourceMaps) {
    appendDiagnostics(context, verifySourceMapConsistency(pass2, maps, config.safety.strictMode));
    if (hasStrictBlockingDiagnostics(context.diagnostics, config)) {
      throwSafetyPolicyViolation(context.diagnostics);
    }
  }
  normalizeDiagnostics(context);
  for (const mapRelativePath of Object.keys(maps).sort()) {
    recordStage(context, `${mapRelativePath}.map`, "sourcemap");
  }
  if (!isVerifyMode) {
    for (const asset of pass2) {
      recordStage(context, asset.relativePath, "emit");
    }
  }

  const report = createTransformReport(context, pass2.length, outputFiles);
  if (!isVerifyMode) {
    report.artifactPaths = await writeRunArtifacts(config, report);
  }
  const requestedReportPath = options.jsonReportPath;
  if (requestedReportPath && !isVerifyMode) {
    await writeJsonReport(path.resolve(requestedReportPath), report);
  }

  return {
    success: true,
    filesProcessed: pass2.length,
    outputFiles,
    report
  };
}

async function discoverAssets(config: ObfuscatorConfig): Promise<PipelineAsset[]> {
  const assets: PipelineAsset[] = [];
  for (const input of config.inputs) {
    const absolute = path.resolve(config.root, input);
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      const files = await walk(absolute);
      for (const file of files) {
        const type = classify(file);
        if (!type) {
          continue;
        }
        const code = await fs.readFile(file, "utf8");
        assets.push({
          filePath: file,
          relativePath: safeRelative(config.root, file),
          type,
          code
        });
      }
      continue;
    }

    const type = classify(absolute);
    if (!type) {
      continue;
    }
    const code = await fs.readFile(absolute, "utf8");
    assets.push({
      filePath: absolute,
      relativePath: safeRelative(config.root, absolute),
      type,
      code
    });
  }

  assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return assets;
}

async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.resolve(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walk(absolute)));
      continue;
    }
    output.push(absolute);
  }
  return output;
}

function classify(filePath: string): PipelineAsset["type"] | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "js";
  }
  if (extension === ".css") {
    return "css";
  }
  if (extension === ".html" || extension === ".htm") {
    return "html";
  }
  return null;
}

function parseAsset(asset: PipelineAsset): PipelineAsset {
  if (asset.type === "js") {
    return parseJs(asset);
  }
  if (asset.type === "css") {
    return parseCss(asset);
  }
  return parseHtml(asset);
}

function transformPass1(asset: PipelineAsset, context: PipelineContext): PipelineAsset {
  if (asset.type === "js") {
    return transformJsPass1(asset, context);
  }
  if (asset.type === "css") {
    return transformCssPass1(asset, context);
  }
  return transformHtmlPass1(asset, context);
}

function safeRelative(root: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(root), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) {
    return path.basename(absolutePath).replace(/\\/g, "/");
  }
  return relative.replace(/\\/g, "/");
}

function recordStage(context: PipelineContext, file: string, stage: string): void {
  const existing = context.stageLedger.find((entry) => entry.file === file);
  if (existing) {
    existing.stages.push(stage);
    return;
  }
  context.stageLedger.push({ file, stages: [stage] });
}

function throwSafetyPolicyViolation(diagnostics: string[]): never {
  const error = new Error(
    `Safety policy violation detected (${diagnostics.length} diagnostic${
      diagnostics.length === 1 ? "" : "s"
    }): ${diagnostics.slice(0, 3).join(" | ")}`
  );
  error.name = "SafetyPolicyViolation";
  throw error;
}

function appendDiagnostics(context: PipelineContext, diagnostics: string[]): void {
  if (diagnostics.length === 0) {
    return;
  }
  context.diagnostics = mergeDeterministicDiagnostics(context.diagnostics, diagnostics);
}

function normalizeDiagnostics(context: PipelineContext): void {
  context.diagnostics = mergeDeterministicDiagnostics(context.diagnostics, []);
}

function hasStrictBlockingDiagnostics(diagnostics: string[], config: ObfuscatorConfig): boolean {
  if (!config.safety.strictMode) {
    return false;
  }

  for (const diagnostic of diagnostics) {
    const tag = extractDiagnosticTag(diagnostic);
    if (!tag) {
      return true;
    }

    if (isInformationalPass1Diagnostic(tag)) {
      continue;
    }

    if (
      !config.safety.abortOnSemanticNoiseRisk &&
      (tag === PASS1_DIAGNOSTIC_TAGS.semanticNoiseRisk || tag === PASS1_DIAGNOSTIC_TAGS.semanticNoiseUnsupported)
    ) {
      continue;
    }

    return true;
  }

  return false;
}