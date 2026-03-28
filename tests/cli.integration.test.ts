import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/command";

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

describe("cli integration", () => {
  it("runs happy path with input and output arguments", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-"));
    const inputDir = path.join(tempRoot, "input");
    const outputDir = path.join(tempRoot, "output");
    const reportPath = path.join(tempRoot, "report.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const a = 1;\n", "utf8");

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(
      [
        "run",
        "--input",
        inputDir,
        "--output",
        outputDir,
        "--seed",
        "cli-seed",
        "--json-report",
        reportPath
      ],
      {
        out: (line) => stdout.push(line),
        err: (line) => stderr.push(line)
      }
    );

    const outputFile = path.join(outputDir, "tiny.js");
    const sourceMapFile = path.join(outputDir, "tiny.js.map");
    const reportExists = await fs
      .stat(reportPath)
      .then(() => true)
      .catch(() => false);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Obfuscation complete.");
    expect(await fs.readFile(outputFile, "utf8")).toMatch(/const x_[a-f0-9]{6} = 1;/);
    await expect(fs.stat(sourceMapFile)).resolves.toBeDefined();
    expect(reportExists).toBe(true);
  });

  it("returns non-zero exit code for validation failures", async () => {
    const code = await runCli(["run"], {
      out: () => {},
      err: () => {}
    });
    expect(code).toBe(3);
  });

  it("returns exit code 2 for strict safety policy violations", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-strict-"));
    const inputDir = path.join(tempRoot, "input");
    const configPath = path.join(tempRoot, "obfuscator.config.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "main.js"), "import './missing.js';\n", "utf8");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          root: tempRoot,
          inputs: [inputDir],
          outDir: "out",
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

    const code = await runCli(["run", "--config", configPath], {
      out: () => {},
      err: () => {}
    });

    expect(code).toBe(2);
  });

  it("returns exit code 1 for unexpected runtime failures", async () => {
    const code = await runCli(["run", "--config", "./does-not-exist.json"], {
      out: () => {},
      err: () => {}
    });

    expect(code).toBe(1);
  });

  it("runs verify command without emitting output files or report artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-verify-"));
    const inputDir = path.join(tempRoot, "input");
    const outputDir = path.join(tempRoot, "output");
    const reportPath = path.join(tempRoot, "verify-report.json");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, "tiny.js"), "const value = 1;\n", "utf8");

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(
      [
        "verify",
        "--input",
        inputDir,
        "--output",
        outputDir,
        "--seed",
        "verify-seed",
        "--json-report",
        reportPath
      ],
      {
        out: (line) => stdout.push(line),
        err: (line) => stderr.push(line)
      }
    );

    const outputExists = await pathExists(path.join(outputDir, "tiny.js"));
    const sourceMapExists = await pathExists(path.join(outputDir, "tiny.js.map"));
    const runManifestExists = await pathExists(path.join(outputDir, "run-manifest.json"));
    const transformLedgerExists = await pathExists(path.join(outputDir, "transform-ledger.json"));
    const diagnosticsExists = await pathExists(path.join(outputDir, "diagnostics.json"));
    const verifyReportExists = await pathExists(reportPath);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Verification complete.");
    expect(stdout.join("\n")).toContain("No output files were written.");
    expect(outputExists).toBe(false);
    expect(sourceMapExists).toBe(false);
    expect(runManifestExists).toBe(false);
    expect(transformLedgerExists).toBe(false);
    expect(diagnosticsExists).toBe(false);
    expect(verifyReportExists).toBe(false);
  });

  it("allows run command without explicit output or seed flags", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-run-defaults-"));
    const inputFile = path.join(tempRoot, "tiny.js");
    await fs.writeFile(inputFile, "const a = 1;\n", "utf8");

    const stdout: string[] = [];
    const stderr: string[] = [];
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const code = await runCli(["run", "--input", inputFile], {
        out: (line) => stdout.push(line),
        err: (line) => stderr.push(line)
      });

      expect(code).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout.join("\n")).toContain("Obfuscation complete.");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("allows verify command without explicit output or seed flags", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "obf-cli-verify-defaults-"));
    const inputFile = path.join(tempRoot, "tiny.js");
    await fs.writeFile(inputFile, "const a = 1;\n", "utf8");

    const stdout: string[] = [];
    const stderr: string[] = [];
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const code = await runCli(["verify", "--input", inputFile], {
        out: (line) => stdout.push(line),
        err: (line) => stderr.push(line)
      });

      expect(code).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout.join("\n")).toContain("Verification complete.");
      expect(stdout.join("\n")).toContain("No output files were written.");
    } finally {
      process.chdir(previousCwd);
    }
  });
});