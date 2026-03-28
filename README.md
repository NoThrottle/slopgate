# Slopgate

Deterministic two-pass obfuscator for HTML, CSS, and JavaScript assets.

## Responsible Use

Use this package only for authorized software protection. Do not use it to conceal malware, fraud, phishing, unauthorized access, or evasion of lawful security controls.

## Install

```bash
npm install
npm run build
```

## 60-Second Quickstart

Run a deterministic obfuscation pass:

```bash
node dist/cli/command.js run --input ./tests/fixtures --output ./dist-obf --seed release-1
```

Run verification without writing transformed output files:

```bash
node dist/cli/command.js verify --input ./tests/fixtures --output ./dist-obf --seed release-1
```

Verify mode runs parse, graph, pass planning, guardrails, and source-map checks, but does not emit transformed assets, source maps, run artifacts, or JSON report files.

## Features at a Glance

| Area                    | Status      | Notes                                                                     |
| ----------------------- | ----------- | ------------------------------------------------------------------------- |
| CLI contract            | Stable v1   | Commands are intentionally frozen to run and verify.                      |
| API contract            | Stable v1   | Public exports include obfuscate, verify, and defineConfig.               |
| Determinism             | Implemented | Fixed input + config + seed gives stable output and diagnostics ordering. |
| Safety policy           | Implemented | Strict mode fails closed on policy diagnostics.                           |
| Cross-asset rename sync | Implemented | Supported class and id sync across HTML, CSS, and static JS selectors.    |
| Release gate            | Implemented | See release checklist and status docs for evidence mapping.               |

## Documentation

- [CLI reference](docs/cli-reference.md)
- [API reference](docs/api-reference.md)
- [Configuration reference](docs/configuration-reference.md)
- [Demos](docs/demos.md)
- [Architecture](docs/architecture.md)
- [Status](docs/status.md)
- [Roadmap](docs/roadmap.md)

## Contributing and Release

- [Contributing guide](CONTRIBUTING.md)
- [V1 release checklist](docs/v1-release-checklist.md)
- [Security policy](SECURITY.md)

Release criteria and REQ-to-evidence mapping are documented in [docs/v1-release-checklist.md](docs/v1-release-checklist.md).
