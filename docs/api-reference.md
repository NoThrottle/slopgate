# API Reference

Public API exports from the package root:

- `obfuscate(options)`
- `verify(options)`
- `defineConfig(config)`

Source references:

- `src/index.ts`
- `src/api/index.ts`
- `src/api/types.ts`

## TypeScript Usage

```ts
import { defineConfig, obfuscate, verify } from "slopgate";

const config = defineConfig({
  root: process.cwd(),
  inputs: ["tests/fixtures"],
  outDir: "dist-obf",
  seed: "release-1"
});

const runResult = await obfuscate({ config });
const verifyResult = await verify({ config });

console.log(runResult.report.manifestHash);
console.log(verifyResult.report.diagnostics.length);
```

## obfuscate(options)

Runs the full pipeline in run mode and emits transformed outputs.

Input shape:

- `configPath?`: optional path to a JSON config file.
- `config?`: partial inline config.
- `overrides?`: partial config overrides.
- `jsonReportPath?`: optional path for writing report JSON.

Returns `Promise<ObfuscationResult>`.

## verify(options)

Runs the same planning and safety checks in verify mode.

Input shape:

- `configPath?`: optional path to a JSON config file.
- `config?`: partial inline config.
- `overrides?`: partial config overrides.

Returns `Promise<ObfuscationResult>`.

Verify mode does not emit transformed assets or run artifacts.

## defineConfig(config)

Merges the provided partial config with defaults and returns a full `ObfuscatorConfig` object.

## Core Result Types

`ObfuscationResult` fields:

- `success`: boolean
- `filesProcessed`: number
- `outputFiles`: string[]
- `report`: `TransformReport`

`TransformReport` stable fields:

- `filesProcessed`: number
- `diagnostics`: string[]
- `manifestHash`: string
- `transformLedger`: array of `{ file, stages }`
- `artifactPaths?`: string[] present in run mode

## Error Behavior

- Config validation failures throw with a `Config validation failed` message.
- Strict safety policy failures throw `SafetyPolicyViolation`.

Related docs:

- [CLI reference](cli-reference.md)
- [Configuration reference](configuration-reference.md)
- [Architecture](architecture.md)
