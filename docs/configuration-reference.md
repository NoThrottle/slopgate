# Configuration Reference

Configuration can be supplied in two ways:

- CLI: `--config <path>` with optional CLI overrides.
- API: pass `config` and optional `overrides` to `obfuscate` or `verify`.

Default values are defined in `src/api/defaults.ts`.
Validation rules are enforced in `src/config/validation.ts`.

## Minimal Config

```json
{
  "root": ".",
  "inputs": ["tests/fixtures"],
  "outDir": "dist-obf",
  "seed": "release-1"
}
```

## Top-Level Fields

| Field        | Type             | Required | Default                             |
| ------------ | ---------------- | -------- | ----------------------------------- |
| `root`       | string           | yes      | `"."`                               |
| `inputs`     | string[]         | yes      | `[]`                                |
| `outDir`     | string           | yes      | `"dist-obf"`                        |
| `seed`       | string or number | yes      | `"default-seed"`                    |
| `sourceMaps` | boolean          | no       | `true`                              |
| `minify`     | boolean          | no       | `true`                              |
| `pass1`      | object           | no       | enabled with conservative defaults  |
| `pass2`      | object           | no       | enabled with deterministic defaults |
| `safety`     | object           | no       | strict mode on                      |
| `reporting`  | object           | no       | ledger on, JSON report off          |

## pass1

### pass1.js

| Field                   | Type               | Default |
| ----------------------- | ------------------ | ------- |
| `renameLocals`          | boolean            | `true`  |
| `stringEncoding`        | `none` or `base64` | `none`  |
| `controlFlowFlattening` | `off` or `safe`    | `off`   |
| `deadCodeInjection`     | boolean            | `false` |
| `semanticNoise`         | `off` or `safe`    | `off`   |
| `noopNestingNoise`      | `off` or `safe`    | `off`   |

### pass1.css

| Field                    | Type            | Default |
| ------------------------ | --------------- | ------- |
| `renameClasses`          | boolean         | `false` |
| `renameIds`              | boolean         | `false` |
| `renameCustomProperties` | boolean         | `false` |
| `noopRuleNoise`          | `off` or `safe` | `off`   |

### pass1.html

| Field                  | Type            | Default |
| ---------------------- | --------------- | ------- |
| `rewriteInlineScripts` | boolean         | `false` |
| `rewriteInlineStyles`  | boolean         | `false` |
| `noopStructuralNoise`  | `off` or `safe` | `off`   |

## pass2

| Field                                   | Type                                  | Default             |
| --------------------------------------- | ------------------------------------- | ------------------- |
| `enabled`                               | boolean                               | `true`              |
| `profile`                               | `semantic-noise-v1`                   | `semantic-noise-v1` |
| `identifierStyle`                       | `ambiguousTokens` or `semanticTokens` | `ambiguousTokens`   |
| `semanticTokenDictionaryWords`          | string[]                              | `[]`                |
| `semanticTokenIncludeBuiltInVocabulary` | boolean                               | `true`              |
| `preservePublicAPI`                     | boolean                               | `true`              |
| `rewritePublicContractSurfaces`         | boolean                               | `false`             |
| `publicContractSurfaceKinds`            | array                                 | `[]`                |

Allowed `publicContractSurfaceKinds` values:

- `url`
- `queryKey`
- `routeName`
- `eventKey`
- `jsonField`

## safety

| Field           | Type     | Default |
| --------------- | -------- | ------- |
| `strictMode`    | boolean  | `true`  |
| `reservedNames` | string[] | `[      |

"React", "Vue", "Svelte", "$", "jQuery"
]`|
|`reservedPatterns`| string[] |`[
"^__", "^data-", "^aria-"
]`|
|`reservedCssClasses`| string[] |`[
"is-active", "is-open"
]`|
|`reservedGlobals`| string[] |`["window", "document", "globalThis"]`|
|`abortOnCollision`| boolean |`true`|
|`abortOnDynamicEvalRisk`| boolean |`true`|
|`abortOnSemanticNoiseRisk`| boolean |`true`|
|`detectDynamicNameAccess`| boolean |`true`|
|`abortOnDynamicNameAccessRisk`| boolean |`true` |

## reporting

| Field                  | Type               | Default |
| ---------------------- | ------------------ | ------- |
| `writeTransformLedger` | boolean            | `true`  |
| `writeJsonReport`      | boolean            | `false` |
| `verbosity`            | `silent` or `info` | `info`  |

## Validation Notes

- `inputs` must contain at least one non-empty path.
- `semanticTokenDictionaryWords` entries must match `^[A-Za-z_][A-Za-z0-9_]*$`.
- In strict mode, safety diagnostics can fail the run.

## Example Advanced Config

```json
{
  "root": ".",
  "inputs": ["tests/fixtures/pass1-semantic-noise"],
  "outDir": ".demo-out/semantic-noop-run",
  "seed": "demo-seed-semantic-noop",
  "pass1": {
    "js": {
      "semanticNoise": "safe",
      "noopNestingNoise": "safe"
    },
    "css": {
      "noopRuleNoise": "safe"
    },
    "html": {
      "noopStructuralNoise": "safe"
    }
  },
  "safety": {
    "strictMode": false,
    "abortOnSemanticNoiseRisk": false
  }
}
```

Related docs:

- [CLI reference](cli-reference.md)
- [API reference](api-reference.md)
- [Demos](demos.md)
