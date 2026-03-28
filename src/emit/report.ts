import fs from "node:fs/promises";
import path from "node:path";
import { hashText } from "../core/seed";
import type { PipelineContext } from "../core/types";
import type { ObfuscatorConfig, TransformReport } from "../api/types";

export function createTransformReport(
  context: PipelineContext,
  filesProcessed: number,
  outputFiles: string[]
): TransformReport {
  const outRoot = path.resolve(context.config.root, context.config.outDir);
  const manifestHash = hashText(
    JSON.stringify({
      seed: context.normalizedSeed,
      files: outputFiles
        .map((entry) => path.relative(outRoot, entry))
        .map((entry) => path.normalize(entry).replace(/\\/g, "/"))
        .sort(),
      ledger: context.stageLedger
    })
  );

  return {
    filesProcessed,
    diagnostics: context.diagnostics,
    manifestHash,
    transformLedger: context.stageLedger
  };
}

export async function writeJsonReport(reportPath: string, report: TransformReport): Promise<void> {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
}

export async function writeRunArtifacts(
  config: ObfuscatorConfig,
  report: TransformReport
): Promise<string[]> {
  const outRoot = path.resolve(config.root, config.outDir);
  await fs.mkdir(outRoot, { recursive: true });

  const runManifestPath = path.resolve(outRoot, "run-manifest.json");
  const transformLedgerPath = path.resolve(outRoot, "transform-ledger.json");
  const diagnosticsPath = path.resolve(outRoot, "diagnostics.json");

  const configHash = hashText(
    JSON.stringify({
      inputs: [...config.inputs].sort(),
      outDir: config.outDir,
      seed: config.seed,
      sourceMaps: config.sourceMaps,
      minify: config.minify,
      pass1: config.pass1,
      pass2: config.pass2,
      safety: config.safety,
      reporting: config.reporting
    })
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    seed: String(config.seed),
    configHash,
    filesProcessed: report.filesProcessed,
    manifestHash: report.manifestHash,
    diagnosticsCount: report.diagnostics.length
  };

  await fs.writeFile(runManifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(transformLedgerPath, JSON.stringify(report.transformLedger, null, 2), "utf8");
  await fs.writeFile(diagnosticsPath, JSON.stringify(report.diagnostics, null, 2), "utf8");

  return [runManifestPath, transformLedgerPath, diagnosticsPath];
}