## TypeScript Defaults

- ESM-only with `Node16` module resolution (`.js` extensions in imports)
- `strict: true`, TypeBox + AJV for schemas
- Biome for linting/formatting (tabs, 120 width, `useConst: error`)
- No dynamic imports, no guessing types — check `node_modules`

## Talk to User
Always end with:
- `## Completed`: your work summary
- `## Files Changed`: (paths + what changed)
- `## Notes`: (risks, follow-ups, commands to run)

## Project Layout
- `src/`: source code
- `test/`: property-based tests
- `spec/`: behavior contracts, APIs, invariants
- when need to refer pi-ai, check `/Users/jhy/Projects/oss/pi-mono/packages/ai/`

## Dependency

**Minimal dependencies**
- `@mariozechner/pi-ai` — LLM calls, validation, streaming
- `@sinclair/typebox` — Schema definitions

## CLI Follows Unix Philosophy

CLI should be composable with other tools:

```bash
# ✅ Good: Works with pipes
cat doc.txt | pie -s schema.json -p "Extract"
pie ... | jq '.entities[]'

# ✅ Good: Clear exit codes
# 0 = success, 1 = extraction failed, 2 = bad args, 3 = API error

# ✅ Good: Stdout for data, stderr for progress
pie --verbose 2>progress.log >result.json
```

## AbortSignal Propagation

Always pass `signal` through the entire call chain:

```typescript
async function extract<T>(input: string, options: ExtractOptions<T>) {
  const { signal } = options;
  
  // Check before expensive operations
  if (signal?.aborted) throw new AbortError();
  
  // Pass to LLM call
  const stream = streamSimple(model, context, { signal });
  
  // Pass to async validators
  await runHttpValidator(data, url, signal);
  
  // Pass to command validators
  await runCommandValidator(data, command, signal);
}
```

## No Retry for Unrecoverable Errors

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
  // Validation errors → retry
  // Rate limits → retry (pi-ai handles backoff)
  return true;
}
```

## Code Style Guidelines (TypeScript)

- Use `async function main()` with `void main().catch(...)` as the entrypoint; avoid top-level await in app code.
- Keep pure helpers (`validate`, `logProgress`, etc.) outside `main`; keep side effects localized.
- Parse CLI args inside `main` and provide sensible defaults.
- Prefer explicit types for public exports and schema-derived types via `Static<typeof Schema>`.
- Write progress/status to stderr and results/data to stdout.
- Prefer `process.exitCode = 1` over `process.exit(1)` for errors.
- Examples should include a short header comment with purpose and run commands.

## Code Quality

- No `any` types unless absolutely necessary
- Check node_modules for external API type definitions instead of guessing
- Never use inline imports or dynamic imports (no `await import()`, no `import("pkg").Type`)
- Ask before removing functionality or code that appears intentional

## Commands

- After code changes (not documentation-only changes): run `npm run check` and fix all errors and warnings
- Only run build or test commands when the user asks

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
- If `## [Unreleased]` is missing, add it at the top
- Append to existing subsections; do not create duplicates
- Never modify already-released version sections
