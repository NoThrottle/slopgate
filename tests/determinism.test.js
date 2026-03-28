"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const api_1 = require("../src/api");
(0, vitest_1.describe)("determinism", () => {
    (0, vitest_1.it)("produces identical output for same seed and inputs", async () => {
        const tempRoot = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "obf-seed-"));
        const inputDir = node_path_1.default.join(tempRoot, "in");
        const outOne = node_path_1.default.join(tempRoot, "out-1");
        const outTwo = node_path_1.default.join(tempRoot, "out-2");
        await promises_1.default.mkdir(inputDir, { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(inputDir, "tiny.js"), "const value = 1;\nconsole.log(value);\n", "utf8");
        const first = await (0, api_1.obfuscate)({
            config: {
                root: tempRoot,
                inputs: [inputDir],
                outDir: outOne,
                seed: "same-seed"
            }
        });
        const second = await (0, api_1.obfuscate)({
            config: {
                root: tempRoot,
                inputs: [inputDir],
                outDir: outTwo,
                seed: "same-seed"
            }
        });
        const firstFile = await promises_1.default.readFile(first.outputFiles[0], "utf8");
        const secondFile = await promises_1.default.readFile(second.outputFiles[0], "utf8");
        (0, vitest_1.expect)(firstFile).toBe(secondFile);
        (0, vitest_1.expect)(first.report.manifestHash).toBe(second.report.manifestHash);
    });
});
