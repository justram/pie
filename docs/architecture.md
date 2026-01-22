# Architecture

## Layout

```
repo/
  src/
    cli/           # CLI parsing, config, streaming helpers
    core/          # extraction engine, schemas, validators, cache implementations
    utils/         # shared utilities (message helpers, parsing)
    main.ts        # CLI orchestration (invokes core extract)
    cli.ts         # executable CLI entry (shebang)
    index.ts       # public SDK surface
  bin/
    pie            # thin wrapper to dist/cli.js
  docs/
  examples/
  test/
  spec/
```

## CLI Flow

1. `src/cli.ts` handles the executable entry and forwards to `src/main.ts`.
2. `src/main.ts` parses arguments, resolves config/recipes, and invokes `extract`.
3. `src/cli/*` modules handle CLI-specific concerns (args, attachments, config, OAuth, streaming).

## Core Extraction

- `src/core/` contains the extraction engine, schema normalization, validators, and cache implementations.
- `src/extract.ts` and `src/types.ts` expose the primary SDK APIs.

## Public API

- `src/index.ts` is the curated public surface for the SDK.
- `pie/cache` is a supported subpath for cache helpers.
