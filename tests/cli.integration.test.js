"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const command_1 = require("../src/cli/command");
(0, vitest_1.describe)("cli integration", () => {
    (0, vitest_1.it)("runs happy path with input and output arguments", async () => {
        const tempRoot = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "obf-cli-"));
        const inputDir = node_path_1.default.join(tempRoot, "input");
        const outputDir = node_path_1.default.join(tempRoot, "output");
        const reportPath = node_path_1.default.join(tempRoot, "report.json");
        await promises_1.default.mkdir(inputDir, { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(inputDir, "tiny.js"), "const a = 1;\n", "utf8");
        const stdout = [];
        const stderr = [];
        const code = await (0, command_1.runCli)([
            "run",
            "--input",
            inputDir,
            "--output",
            outputDir,
            "--seed",
            "cli-seed",
            "--json-report",
            reportPath
        ], {
            out: (line) => stdout.push(line),
            err: (line) => stderr.push(line)
        });
        const outputFile = node_path_1.default.join(outputDir, "tiny.js");
        const reportExists = await promises_1.default
            .stat(reportPath)
            .then(() => true)
            .catch(() => false);
        (0, vitest_1.expect)(code).toBe(0);
        (0, vitest_1.expect)(stderr).toEqual([]);
        (0, vitest_1.expect)(stdout.join("\n")).toContain("Obfuscation complete.");
        (0, vitest_1.expect)(await promises_1.default.readFile(outputFile, "utf8")).toContain("pass2:cli-seed");
        (0, vitest_1.expect)(reportExists).toBe(true);
    });
    (0, vitest_1.it)("returns non-zero exit code for validation failures", async () => {
        const code = await (0, command_1.runCli)(["run"], {
            out: () => { },
            err: () => { }
        });
        (0, vitest_1.expect)(code).toBe(3);
    });
});
