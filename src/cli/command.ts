#!/usr/bin/env node
import path from "node:path";
import { obfuscate, verify } from "../api/index";
import { defaultConfig } from "../api/defaults";
import { mergeConfig } from "../config/merge";
import { validateConfig } from "../config/validation";
import { formatHumanSummary, formatHumanVerifySummary, formatJsonSummary } from "./reporters";

interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

interface ParsedArgs {
  command: "run" | "verify" | "help";
  input?: string;
  output?: string;
  configPath?: string;
  seed?: string;
  json?: boolean;
  jsonReportPath?: string;
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === "help") {
    io.out(helpText());
    return 0;
  }

  try {
    const overrideConfig = mergeConfig(defaultConfig, {
      inputs: args.input ? [args.input] : defaultConfig.inputs,
      outDir: args.output ?? defaultConfig.outDir,
      seed: args.seed ?? defaultConfig.seed
    });
    const issues = validateConfig(overrideConfig);
    if (issues.length > 0 && !args.configPath) {
      io.err(formatValidationIssues(issues));
      return 3;
    }

    const baseOptions = {
      configPath: args.configPath,
      config: {
        root: process.cwd()
      },
      overrides: {
        ...(args.input ? { inputs: [path.resolve(args.input)] } : {}),
        ...(args.output ? { outDir: path.resolve(args.output) } : {}),
        ...(args.seed !== undefined ? { seed: args.seed } : {})
      }
    };
    const result =
      args.command === "verify"
        ? await verify(baseOptions)
        : await obfuscate({
            ...baseOptions,
            jsonReportPath: args.jsonReportPath
          });

    if (args.json) {
      io.out(formatJsonSummary(result));
    } else {
      io.out(args.command === "verify" ? formatHumanVerifySummary(result) : formatHumanSummary(result));
    }
    return 0;
  } catch (error) {
    const cast = error as Error;
    if (cast.name === "SafetyPolicyViolation") {
      io.err(cast.message);
      return 2;
    }
    if (cast.message.includes("Config validation failed")) {
      io.err(cast.message);
      return 3;
    }
    io.err(cast.message);
    return 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help" };
  }

  const output: ParsedArgs = {
    command: argv[0] === "run" || argv[0] === "verify" ? argv[0] : "help"
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--input" || token === "-i") {
      output.input = next;
      index += 1;
      continue;
    }
    if (token === "--output" || token === "-o") {
      output.output = next;
      index += 1;
      continue;
    }
    if (token === "--config" || token === "-c") {
      output.configPath = next;
      index += 1;
      continue;
    }
    if (token === "--seed") {
      output.seed = next;
      index += 1;
      continue;
    }
    if (token === "--json") {
      output.json = true;
      continue;
    }
    if (token === "--json-report") {
      output.jsonReportPath = next;
      index += 1;
    }
  }
  return output;
}

function helpText(): string {
  return [
    "slopgate <run|verify> [options]",
    "",
    "Commands:",
    "  run                        Transform and emit obfuscated assets",
    "  verify                     Run verification checks without writing output files",
    "",
    "Options:",
    "  -i, --input <path>         Input file or directory",
    "  -o, --output <path>        Output directory",
    "  -c, --config <path>        Config JSON path",
    "  --seed <seed>              Deterministic seed",
    "  --json                     Print JSON summary",
    "  --json-report <path>       Write JSON report to file (run only)",
    "  -h, --help                 Show this help text"
  ].join("\n");
}

function formatValidationIssues(issues: Array<{ path: string; message: string }>): string {
  return ["Config validation failed:", ...issues.map((entry) => `- ${entry.path}: ${entry.message}`)].join(
    "\n"
  );
}

function defaultIo(): CliIo {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`)
  };
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}