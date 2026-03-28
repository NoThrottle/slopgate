# Contributing

Thanks for contributing.

## Local setup

1. Install dependencies: npm install
2. Build: npm run build
3. Test: npm run test
4. Lint and typecheck: npm run lint and npm run typecheck

## Expectations

- Keep output deterministic for fixed seed/config/input.
- Preserve behavior and fail closed in strict safety mode.
- Add tests for config, pipeline behavior, and CLI contract changes.
- Use small, reviewable commits and include docs updates for user-facing changes.
- Keep docs and metadata aligned with the frozen v1 contract (`run` + `verify` only).
- Keep [docs/v1-release-checklist.md](docs/v1-release-checklist.md) current when changing contract or release-gate behavior.
- Keep [docs/status.md](docs/status.md) and [docs/roadmap.md](docs/roadmap.md) aligned with implementation status and planned scope.

## Pull requests

- Explain what changed and why.
- Include test evidence.
- Note any known limitations or follow-up TODO items.
- Include release-gate evidence (`npm run test:release-gate`, `npm pack --dry-run`, `npm run lint`, `npm run typecheck`) for contract-affecting changes.
