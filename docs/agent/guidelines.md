# Agent guidelines

Use this document only when implementing changes or reviewing architecture details. Keep `AGENTS.md` small and refer here for deeper conventions.

## TypeScript defaults
- ESM-only with `Node16` module resolution (`.js` extensions in imports).
- `strict: true`, TypeBox + AJV for schemas.
- Biome for linting/formatting (tabs, 120 width, `useConst: error`).
- No dynamic imports; do not guess external types — check `node_modules`.

## Project layout
- `src/`: source code
- `test/`: property-based tests
- `spec/`: behavior contracts, APIs, invariants
- For `pi-ai` references, check `/Users/jhy/Projects/oss/pi-mono/packages/ai/`.

## CLI conventions
CLI should be composable with other tools:

```bash
# Works with pipes
cat doc.txt | pie -s schema.json -p "Extract"
pie ... | jq '.entities[]'

# Clear exit codes
# 0 = success, 1 = extraction failed, 2 = bad args, 3 = API error

# Stdout for data, stderr for progress
pie --verbose 2>progress.log >result.json
```

Examples:
- [`examples/recipe-system`](../../examples/recipe-system/README.md)
- [`examples/validation-shell`](../../examples/validation-shell/README.md)

## AbortSignal propagation
Always pass `signal` through the entire call chain:

```typescript
async function extract<T>(input: string, options: ExtractOptions<T>) {
  const { signal } = options;

  if (signal?.aborted) throw new AbortError();

  const stream = streamSimple(model, context, { signal });
  await runHttpValidator(data, url, signal);
  await runCommandValidator(data, command, signal);
}
```

Example:
- [`examples/batch-classification`](../../examples/batch-classification/run.ts)

## No retry for unrecoverable errors
Some errors should fail immediately without retry:

```typescript
const UNRECOVERABLE = [
  /authentication/i,
  /api.key/i,
  /permission/i,
  /quota.exceeded/i,
];

function shouldRetry(error: Error): boolean {
  if (UNRECOVERABLE.some(p => p.test(error.message))) {
    return false;
  }
  return true;
}
```

## Code style guidelines (TypeScript)
- Use `async function main()` with `void main().catch(...)` as entrypoint; avoid top-level await in app code.
- Keep pure helpers (`validate`, `logProgress`, etc.) outside `main`; keep side effects localized.
- Parse CLI args inside `main` and provide sensible defaults.
- Prefer explicit types for public exports and schema-derived types via `Static<typeof Schema>`.
- Write progress/status to stderr and results/data to stdout.
- Prefer `process.exitCode = 1` over `process.exit(1)` for errors.
- Examples should include a short header comment with purpose and run commands.

## Code quality
- No `any` types unless absolutely necessary.
- Never use inline imports or dynamic imports (no `await import()`, no `import("pkg").Type`).
- Ask before removing functionality or code that appears intentional.

## Commands
- After code changes (not documentation-only changes): run `npm run check` and fix all errors and warnings.
- Only run build or test commands when asked.

## Changelog
Location: `CHANGELOG.md`

### Format
Use these sections under `## [Unreleased]`:
- `### Breaking Changes` - API changes requiring migration
- `### Added` - New features
- `### Changed` - Changes to existing functionality
- `### Fixed` - Bug fixes
- `### Removed` - Removed features

### Rules
- If `## [Unreleased]` is missing, add it at the top.
- Append to existing subsections; do not create duplicates.
- Never modify already-released version sections.
