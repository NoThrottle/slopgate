import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/command";

function toWorkspacePath(...parts: string[]): string {
  return path.resolve(...parts);
}

function parsePackDryRunFiles(raw: string): string[] {
  const parsed = JSON.parse(raw) as Array<{ files?: Array<{ path?: string }> }>;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }
  return (parsed[0].files ?? [])
    .map((entry) => entry.path)
    .filter((entry): entry is string => typeof entry === "string")
    .sort();
}

describe("release artifacts", () => {
  it("emits expected run artifact inventory", async () => {
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "obf-release-artifacts-run-"));
    const inputDir = path.join(tempRoot, "input");
    const outDir = path.join(tempRoot, "run-out");
    const reportPath = path.join(tempRoot, "report.json");
    await fsp.mkdir(inputDir, { recursive: true });
    await fsp.writeFile(path.join(inputDir, "app.js"), "const appRoot = document.querySelector('#app');\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "index.html"), "<div id=\"app\" class=\"hero\"></div>\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "styles.css"), "#app.hero { color: red; }\n", "utf8");

    const code = await runCli(
      ["run", "--input", inputDir, "--output", outDir, "--seed", "release-artifacts", "--json-report", reportPath],
      {
        out: () => {},
        err: () => {}
      }
    );

    expect(code).toBe(0);

    const expectedOutputs = [
      "app.js",
      "util.js",
      "index.html",
      "styles.css",
      "app.js.map",
      "util.js.map",
      "styles.css.map",
      "run-manifest.json",
      "transform-ledger.json",
      "diagnostics.json"
    ];

    for (const file of expectedOutputs) {
      await expect(fsp.stat(path.join(outDir, file))).resolves.toBeDefined();
    }
    await expect(fsp.stat(reportPath)).resolves.toBeDefined();
  });

  it("guarantees verify mode no-emit behavior", async () => {
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "obf-release-artifacts-verify-"));
    const inputDir = path.join(tempRoot, "input");
    const outDir = path.join(tempRoot, "verify-out");
    const reportPath = path.join(tempRoot, "verify-report.json");
    await fsp.mkdir(inputDir, { recursive: true });
    await fsp.writeFile(path.join(inputDir, "app.js"), "const appRoot = document.querySelector('#app');\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "util.js"), "export const value = 1;\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "index.html"), "<div id=\"app\" class=\"hero\"></div>\n", "utf8");
    await fsp.writeFile(path.join(inputDir, "styles.css"), "#app.hero { color: red; }\n", "utf8");

    const code = await runCli(
      ["verify", "--input", inputDir, "--output", outDir, "--seed", "release-artifacts", "--json-report", reportPath],
      {
        out: () => {},
        err: () => {}
      }
    );

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, "app.js"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "app.js.map"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "run-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "transform-ledger.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "diagnostics.json"))).toBe(false);
    expect(fs.existsSync(reportPath)).toBe(false);
  });

  it("keeps package metadata and build output fields internally consistent", () => {
    const packageJsonPath = toWorkspacePath("package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      main?: string;
      types?: string;
      bin?: Record<string, string>;
      exports?: { "."?: { default?: string; types?: string } };
      files?: string[];
    };

    expect(packageJson.main).toBe("dist/index.js");
    expect(packageJson.types).toBe("dist/index.d.ts");
    expect(packageJson.bin?.["slopgate"]).toBe("dist/cli/command.js");
    expect(packageJson.exports?.["."]?.default).toBe("./dist/index.js");
    expect(packageJson.exports?.["."]?.types).toBe("./dist/index.d.ts");

    const requiredPublishFiles = ["dist", "README.md", "LICENSE", "SECURITY.md", "CONTRIBUTING.md"];
    for (const required of requiredPublishFiles) {
      expect(packageJson.files ?? []).toContain(required);
    }

    const requiredBuildOutputs = ["dist/index.js", "dist/index.d.ts", "dist/cli/command.js"];
    for (const output of requiredBuildOutputs) {
      expect(fs.existsSync(toWorkspacePath(output))).toBe(true);
    }
  });

  it("validates npm pack dry-run publish payload contract", () => {
    const dryRunOutput = execSync("npm pack --dry-run --json", {
      cwd: toWorkspacePath("."),
      encoding: "utf8"
    });

    const publishedFiles = parsePackDryRunFiles(dryRunOutput);

    const required = [
      "README.md",
      "LICENSE",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/cli/command.js"
    ];

    for (const expectedPath of required) {
      expect(publishedFiles).toContain(expectedPath);
    }
  }, 20000);
});
