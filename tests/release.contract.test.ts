import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as api from "../src/index";
import { obfuscate, verify } from "../src/api";
import { runCli } from "../src/cli/command";

describe("release contract", () => {
  it("exposes the frozen v1 public runtime API surface", () => {
    expect(Object.keys(api).sort()).toEqual(["defineConfig", "obfuscate", "verify"]);
  });

  it("returns stable ObfuscationResult and TransformReport field shapes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-release-contract-shape-"));
    const inputDir = path.join(tempRoot, "input");
    const outDir = path.join(tempRoot, "out");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\n", "utf8");

    const result = await obfuscate({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir,
        seed: "contract-shape-seed"
      }
    });

    expect(typeof result.success).toBe("boolean");
    expect(typeof result.filesProcessed).toBe("number");
    expect(Array.isArray(result.outputFiles)).toBe(true);
    expect(result.report).toBeDefined();

    expect(typeof result.report.filesProcessed).toBe("number");
    expect(Array.isArray(result.report.diagnostics)).toBe(true);
    expect(typeof result.report.manifestHash).toBe("string");
    expect(Array.isArray(result.report.transformLedger)).toBe(true);

    for (const ledgerEntry of result.report.transformLedger) {
      expect(typeof ledgerEntry.file).toBe("string");
      expect(Array.isArray(ledgerEntry.stages)).toBe(true);
    }

    expect(Array.isArray(result.report.artifactPaths)).toBe(true);
  });

  it("locks CLI command and exit-code semantics for v1", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-release-contract-cli-"));
    const successInputDir = path.join(tempRoot, "success-input");
    const strictInputDir = path.join(tempRoot, "strict-input");
    const strictConfigPath = path.join(tempRoot, "strict.config.json");
    await fs.mkdir(successInputDir, { recursive: true });
    await fs.mkdir(strictInputDir, { recursive: true });
    await fs.writeFile(path.join(successInputDir, "ok.js"), "const value = 1;\n", "utf8");
    await fs.writeFile(path.join(strictInputDir, "fail.js"), "import './missing.js';\n", "utf8");

    await fs.writeFile(
      strictConfigPath,
      JSON.stringify(
        {
          root: tempRoot,
          inputs: [strictInputDir],
          outDir: "strict-out",
          safety: {
            strictMode: true,
            reservedNames: [],
            reservedPatterns: [],
            reservedCssClasses: [],
            reservedGlobals: [],
            abortOnCollision: true,
            abortOnDynamicEvalRisk: true
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const successCode = await runCli(
      ["run", "--input", successInputDir, "--output", path.join(tempRoot, "run-out")],
      {
        out: () => {},
        err: () => {}
      }
    );
    const strictFailureCode = await runCli(["run", "--config", strictConfigPath], {
      out: () => {},
      err: () => {}
    });
    const validationFailureCode = await runCli(["run"], {
      out: () => {},
      err: () => {}
    });
    const runtimeFailureCode = await runCli(["run", "--config", path.join(tempRoot, "missing-config.json")], {
      out: () => {},
      err: () => {}
    });

    expect(successCode).toBe(0);
    expect(strictFailureCode).toBe(2);
    expect(validationFailureCode).toBe(3);
    expect(runtimeFailureCode).toBe(1);
  });

  it("keeps verify mode no-emit semantics for API and CLI", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-release-contract-verify-"));
    const inputDir = path.join(tempRoot, "input");
    const verifyOut = path.join(tempRoot, "verify-out");
    const cliReportPath = path.join(tempRoot, "verify-report.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\n", "utf8");

    const apiResult = await verify({
      config: {
        root: tempRoot,
        inputs: [inputDir],
        outDir: verifyOut,
        seed: "verify-contract-seed",
        sourceMaps: true
      }
    });

    const cliCode = await runCli(
      ["verify", "--input", inputDir, "--output", verifyOut, "--json-report", cliReportPath],
      {
        out: () => {},
        err: () => {}
      }
    );

    expect(apiResult.success).toBe(true);
    expect(apiResult.outputFiles).toEqual([]);
    expect(cliCode).toBe(0);

    await expect(fs.stat(path.join(verifyOut, "input", "tiny.js"))).rejects.toBeDefined();
    await expect(fs.stat(path.join(verifyOut, "input", "tiny.js.map"))).rejects.toBeDefined();
    await expect(fs.stat(path.join(verifyOut, "run-manifest.json"))).rejects.toBeDefined();
    await expect(fs.stat(path.join(verifyOut, "transform-ledger.json"))).rejects.toBeDefined();
    await expect(fs.stat(path.join(verifyOut, "diagnostics.json"))).rejects.toBeDefined();
    await expect(fs.stat(cliReportPath)).rejects.toBeDefined();
  });
});
