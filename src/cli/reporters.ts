import type { ObfuscationResult } from "../api/types";

export function formatHumanSummary(result: ObfuscationResult): string {
  const diagnostics =
    result.report.diagnostics.length > 0
      ? `\nDiagnostics (${result.report.diagnostics.length}):\n- ${result.report.diagnostics.join("\n- ")}`
      : "";
  return [
    "Obfuscation complete.",
    `Files processed: ${result.filesProcessed}`,
    `Manifest hash: ${result.report.manifestHash}${diagnostics}`
  ].join("\n");
}

export function formatJsonSummary(result: ObfuscationResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatHumanVerifySummary(result: ObfuscationResult): string {
  const diagnostics =
    result.report.diagnostics.length > 0
      ? `\nDiagnostics (${result.report.diagnostics.length}):\n- ${result.report.diagnostics.join("\n- ")}`
      : "\nDiagnostics: none";
  return [
    "Verification complete.",
    `Files analyzed: ${result.filesProcessed}`,
    `Manifest hash: ${result.report.manifestHash}`,
    "No output files were written.",
    diagnostics
  ].join("\n");
}