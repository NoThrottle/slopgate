# V1 Release Checklist

This checklist is the release gate contract for v1. All requirements are release-blocking.

## Requirements and Evidence

| Requirement | Contract                                                                                                                          | Evidence Commands                                                                                                      | CI Gate Mapping   | Test/Check Mapping                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| REQ-002     | Deterministic output for fixed seed/config/input is locked.                                                                       | `npx vitest run tests/determinism.test.ts tests/release.artifacts.test.ts`                                             | `gate-release-v1` | `tests/determinism.test.ts`, `tests/release.artifacts.test.ts`                                                |
| REQ-005     | Source map and verify no-emit contract is documented and test-locked.                                                             | `npx vitest run tests/source-map.verification.test.ts tests/verify.integration.test.ts tests/release.contract.test.ts` | `gate-release-v1` | `tests/source-map.verification.test.ts`, `tests/verify.integration.test.ts`, `tests/release.contract.test.ts` |
| REQ-006     | Strict safety violations fail with exit code `2` across CLI/API paths.                                                            | `npx vitest run tests/safety.strictness.test.ts tests/cli.integration.test.ts tests/release.contract.test.ts`          | `gate-release-v1` | `tests/safety.strictness.test.ts`, `tests/cli.integration.test.ts`, `tests/release.contract.test.ts`          |
| REQ-007     | v1 dry-run contract is narrowed: `verify` never emits assets/sourcemaps/run artifacts/json report; `run` emits release artifacts. | `npx vitest run tests/verify.integration.test.ts tests/release.artifacts.test.ts tests/release.contract.test.ts`       | `gate-release-v1` | `tests/verify.integration.test.ts`, `tests/release.artifacts.test.ts`, `tests/release.contract.test.ts`       |
| REQ-008     | Public Node API surface is frozen for v1 and contract-tested.                                                                     | `npx vitest run tests/release.contract.test.ts`                                                                        | `gate-release-v1` | `tests/release.contract.test.ts`                                                                              |
| PKG-001     | Package metadata, publish payload, and docs are internally consistent.                                                            | `npx vitest run tests/release.artifacts.test.ts` and `npm pack --dry-run`                                              | `gate-release-v1` | `tests/release.artifacts.test.ts`, release-gate `npm pack --dry-run` step                                     |
| DOC-001     | README, CLI help, CONTRIBUTING, and this checklist describe the same v1 contract.                                                 | Manual docs review in PR + CI pass                                                                                     | `gate-release-v1` | README/CONTRIBUTING checklist links and CLI integration tests                                                 |

## Required Release Gate Command Sequence

1. `npm run build`
2. `npm run test:release-gate`
3. `npm pack --dry-run`
4. `npm run test`
5. `npm run lint`
6. `npm run typecheck`

## CI Decision Rule

A v1 release is allowed only when `gate-release-v1` is green and all required checks above pass without overrides.
