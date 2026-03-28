# CLI Reference

The stable v1 CLI surface includes two commands:

- `run`
- `verify`

Entry point after build:

```bash
node dist/cli/command.js <command> [options]
```

## Commands

### run

Transforms and emits obfuscated assets.

Example:

```bash
node dist/cli/command.js run --input ./tests/fixtures --output ./dist-obf --seed release-1
```

### verify

Runs parse, graph, planning, guardrails, and source-map consistency checks without emitting transformed output files.

Example:

```bash
node dist/cli/command.js verify --input ./tests/fixtures --output ./dist-obf --seed release-1
```

## Options

| Option          | Alias | Value  | Notes                                     |
| --------------- | ----- | ------ | ----------------------------------------- |
| `--input`       | `-i`  | path   | Input file or directory.                  |
| `--output`      | `-o`  | path   | Output directory.                         |
| `--config`      | `-c`  | path   | Config JSON path.                         |
| `--seed`        | none  | string | Deterministic seed override.              |
| `--json`        | none  | flag   | Print JSON summary to stdout.             |
| `--json-report` | none  | path   | Write JSON report file. Used by run mode. |
| `--help`        | `-h`  | flag   | Show help text.                           |

## Exit Codes

| Code | Meaning                   |
| ---- | ------------------------- |
| 0    | Success                   |
| 1    | Runtime or tool failure   |
| 2    | Safety policy violation   |
| 3    | Config validation failure |

## Practical Notes

- If no command or an unknown command is provided, help text is shown.
- CLI input, output, and seed values are passed as config overrides.
- Config validation happens before execution and also during API config preparation.

## Typical Workflows

Build once, then run and verify:

```bash
npm run build
node dist/cli/command.js run --input ./tests/fixtures --output ./dist-obf --seed release-1
node dist/cli/command.js verify --input ./tests/fixtures --output ./dist-obf --seed release-1
```

Release gate checks:

```bash
npm run test:release-gate
npm pack --dry-run
npm run lint
npm run typecheck
```

Related docs:

- [Configuration reference](configuration-reference.md)
- [API reference](api-reference.md)
- [V1 release checklist](v1-release-checklist.md)
