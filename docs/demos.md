# Demos

This page keeps runnable, deterministic demos outside README.

## Prerequisites

```bash
npm install
npm run build
```

## Demo 1: JS-only fixture

Input fixture:

- `tests/fixtures/tiny.js`

Run:

```bash
node dist/cli/command.js run --input ./tests/fixtures/tiny.js --output ./.demo-out/tiny-run --seed demo-seed-js
```

Verify:

```bash
node dist/cli/command.js verify --input ./tests/fixtures/tiny.js --output ./.demo-out/tiny-verify --seed demo-seed-js
```

Expected result: deterministic local identifier rewrites with behavior preserved.

## Demo 2: Cross-asset HTML/CSS/JS sync

Input fixtures:

- `tests/fixtures/cross-asset-sync/index.html`
- `tests/fixtures/cross-asset-sync/styles.css`
- `tests/fixtures/cross-asset-sync/app.js`

Run:

```bash
node dist/cli/command.js run --input ./tests/fixtures/cross-asset-sync --output ./.demo-out/cross-run --seed demo-seed-cross
```

Verify:

```bash
node dist/cli/command.js verify --input ./tests/fixtures/cross-asset-sync --output ./.demo-out/cross-verify --seed demo-seed-cross
```

Expected result: class and id references stay synchronized across HTML attributes, CSS selectors, and static JS selector strings.

## Demo 3: Semantic and no-op pass1 noise

Input fixture folder:

- `tests/fixtures/pass1-semantic-noise`

Run using the demo config:

```bash
node dist/cli/command.js run --config "./docs/SubAgent docs/demo-semantic-noop.demo-config.json" --output ./.demo-out/semantic-noop-run --seed demo-seed-semantic-noop --json
```

Verify parity check:

```bash
node dist/cli/command.js verify --config "./docs/SubAgent docs/demo-semantic-noop.demo-config.json" --output ./.demo-out/semantic-noop-verify --seed demo-seed-semantic-noop --json
```

Expected result:

- JS receives deterministic unreachable semantic decoys and inert no-op nesting.
- HTML receives deterministic inert comment no-op markers.
- CSS receives deterministic inert custom-property duplication no-op.

## Determinism and Safety

- Same input + config + seed yields stable output and diagnostics ordering.
- Changing the seed is expected to change deterministic naming and insertion choices.
- Strict mode fails closed on policy diagnostics.

Related docs:

- [Configuration reference](configuration-reference.md)
- [CLI reference](cli-reference.md)
- [Status](status.md)
