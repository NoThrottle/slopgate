# Roadmap

This roadmap reflects the current v1-stable contract and near-term follow-up work.

## v1 Baseline

The project currently targets a stable v1 contract with:

- CLI commands: `run` and `verify`.
- Public API: `obfuscate`, `verify`, and `defineConfig`.
- Deterministic execution for fixed seed, config, and input.
- Strict safety mode with fail-closed policy behavior.

## Near-Term Priorities

1. Keep release-gate checks green and aligned with documented contracts.
2. Expand fixture coverage for supported transform boundaries and diagnostics.
3. Improve docs clarity as safety policy and config options evolve.

## Backlog Themes

- Broader transform coverage with explicit guardrails.
- Additional edge-case handling for module linkage and dynamic access patterns.
- Stronger source-map fidelity beyond current metadata-level guarantees.

## Working Rules for Roadmap Updates

- Update this page whenever contract-level behavior changes.
- Keep [status.md](status.md) and [v1-release-checklist.md](v1-release-checklist.md) synchronized.
- Do not remove historical internal planning artifacts in docs/SubAgent docs.

## Related Internal Planning Docs

- [Finalization roadmap draft](SubAgent%20docs/v1-finalization-roadmap.md)
- [Phase specs index folder](SubAgent%20docs)
