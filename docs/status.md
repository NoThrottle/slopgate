# Status

## Feature and Delivery Status

| Area                                          | Status   | Evidence                                                             |
| --------------------------------------------- | -------- | -------------------------------------------------------------------- |
| v1 command contract (`run`, `verify`)         | Complete | CLI implementation and release-contract tests                        |
| Deterministic output and diagnostics ordering | Complete | `tests/determinism.test.ts` and release artifacts tests              |
| Strict safety fail-closed behavior            | Complete | `tests/safety.strictness.test.ts`, CLI integration coverage          |
| Verify no-emit contract                       | Complete | `tests/verify.integration.test.ts`, `tests/release.contract.test.ts` |
| Source-map verification gate                  | Complete | `tests/source-map.verification.test.ts`                              |
| API surface freeze for v1                     | Complete | `tests/release.contract.test.ts`                                     |
| Docs split and reference pages                | Complete | README and docs reference set                                        |

## Now

- Maintain v1 contract consistency between code, tests, and docs.
- Keep release checklist and status evidence current when contract behavior changes.

## Next

- Expand fixture coverage for edge-case safety and unsupported pattern diagnostics.
- Continue improving docs examples as additional real-world fixtures are added.

## Risks

- Contract drift between docs and behavior if command, diagnostics, or report shapes change without synchronized updates.
- Regression risk in cross-asset and pass1 behavior if future transforms expand scope without guardrail coverage.

## Done Recently

- Consolidated user-facing docs into focused reference pages.
- Reduced README to a user-first quickstart and links.
- Kept internal phase specs intact under docs/SubAgent docs.

Related docs:

- [Roadmap](roadmap.md)
- [V1 release checklist](v1-release-checklist.md)
- [Contributing](../CONTRIBUTING.md)
