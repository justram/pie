# Changelog

## [Unreleased]

### Breaking Changes

- Published as `@justram/pie` because the unscoped name is already taken on npm.

### Added

### Changed

### Fixed

### Removed

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
