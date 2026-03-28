"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const defaults_1 = require("../src/api/defaults");
const merge_1 = require("../src/config/merge");
const validation_1 = require("../src/config/validation");
(0, vitest_1.describe)("config validation", () => {
    (0, vitest_1.it)("fails when inputs are missing", () => {
        const config = (0, merge_1.mergeConfig)(defaults_1.defaultConfig, {
            root: process.cwd(),
            inputs: [],
            outDir: "dist-obf"
        });
        const issues = (0, validation_1.validateConfig)(config);
        (0, vitest_1.expect)(issues.some((issue) => issue.path === "inputs")).toBe(true);
    });
    (0, vitest_1.it)("accepts a minimal valid config", () => {
        const config = (0, merge_1.mergeConfig)(defaults_1.defaultConfig, {
            root: process.cwd(),
            inputs: [node_path_1.default.join("tests", "fixtures", "tiny.js")],
            outDir: ".vitest-temp/out"
        });
        const issues = (0, validation_1.validateConfig)(config);
        (0, vitest_1.expect)(issues).toEqual([]);
    });
});
