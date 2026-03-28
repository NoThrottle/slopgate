# Architecture

This document describes the runtime architecture behind the stable v1 surface.

## Design Goals

- Deterministic output and diagnostics for fixed input, config, and seed.
- Behavior preservation for supported transformations.
- Fail-closed strict safety mode for policy violations.
- One shared pipeline for run and verify modes.

## Runtime Flow

1. Load and merge config.
2. Validate config.
3. Discover supported assets (JS, CSS, HTML).
4. Parse each asset.
5. Apply pass1 transforms.
6. Build symbol graph and run integrity checks.
7. Build deterministic rename plan.
8. Evaluate pass2 guardrails.
9. Apply pass2 rewrites.
10. Build and verify source-map placeholders.
11. Emit files and artifacts in run mode only.
12. Return deterministic report in run and verify modes.

Pipeline implementation references:

- `src/core/pipeline.ts`
- `src/core/context.ts`
- `src/core/types.ts`

## Module Map

### Public surface

- `src/index.ts`: package exports.
- `src/api/index.ts`: `obfuscate`, `verify`, `defineConfig`.
- `src/api/types.ts`: config and result contracts.
- `src/api/defaults.ts`: default config values.

### CLI

- `src/cli/command.ts`: argument parsing, command dispatch, exit codes.
- `src/cli/config-loader.ts`: config file loading.
- `src/cli/reporters.ts`: human and JSON summaries.

### Config and policy

- `src/config/merge.ts`: deep merge behavior.
- `src/config/validation.ts`: schema-like validation.
- `src/policy/`: reserved-name and safety policy helpers.

### Parsing and graph

- `src/parsers/`: JS, CSS, HTML parse layers.
- `src/graph/symbol-graph.ts`: cross-file symbol/reference graph.
- `src/graph/ref-tracker.ts`: integrity checks and unresolved refs.
- `src/graph/cross-asset-links.ts`: cross-asset link handling.

### Transform passes

- `src/pass1/`: conservative pass1 transforms and diagnostics.
- `src/pass2/`: rename strategy, naming engine, guardrails, rewrites.

### Emission and reporting

- `src/emit/writer.ts`: transformed asset emission.
- `src/emit/sourcemap.ts`: source-map placeholder generation and checks.
- `src/emit/report.ts`: manifest and artifact report emission.

## Run vs Verify

- Run mode writes transformed assets and run artifacts.
- Verify mode executes the same safety and consistency checks but does not emit transformed outputs.

Details and examples:

- [CLI reference](cli-reference.md)
- [API reference](api-reference.md)
- [Status](status.md)
