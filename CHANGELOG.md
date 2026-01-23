# Changelog

## [Unreleased]

### Breaking Changes

### Added

### Changed

### Fixed

- Added release automation scripts and documented the release flow.

### Removed

## 0.2.1

### Breaking Changes

### Added

### Changed

### Fixed

- Restored minimal `AGENTS.md` pointing to `docs/` onboarding.

### Removed

## 0.2.0

### Breaking Changes

### Added

- Added `--list-models` plus filtering/paging/JSON flags to inspect available provider models.
- Added detailed progress output for `scripts/preindex.ts`, with concise tool/file status and periodic counters.
- Defaulted `scripts/preindex.ts` to incremental updates based on git changes to reduce token usage.
- Added clear logging for why a full update is selected in `scripts/preindex.ts`.
- Added token usage summary logging after preindex runs.
- Added untracked file detection to `scripts/preindex.ts` so incremental updates include new files.

### Changed

- Added `examples/hn-insights` and moved the HN insights script into the examples folder.
- Expanded onboarding docs with example/script prerequisites and model listing flags.

### Fixed

- Removed TypeScript syntax from `bin/pie` to keep the CLI runnable under Node.

### Removed

## 0.1.1

### Breaking Changes

- Published as `@justram/pie` because the unscoped name is already taken on npm.

## 0.1.0

- Initial release of the SDK and CLI.
- Mini agent extraction loop with schema validation and retries.
- Validator layers (sync/async, shell, HTTP).
- Response caching with memory and file stores.
- Recipe system for reusable extraction setups.
- Added `src/main.ts` and moved CLI orchestration behind a thin `src/cli.ts` entry.
- Moved internal CLI helpers from `src/core/helpers.ts` to `src/utils/helpers.ts`.
- Routed cache/errors/setup exports through public wrapper modules and kept `bin/pie` as a thin entry.
- Documented the CLI entry flow and added architecture notes.
- Split TypeScript config into `tsconfig.base.json` and `tsconfig.build.json`.
- Updated `.gitignore` for macOS and example artifacts.
- Updated the thinking-comparison example default model to an available Gemini variant.
