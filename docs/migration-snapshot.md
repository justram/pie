# Migration Snapshot (Phase 0)

## Public API Surface (src/index.ts)

Exports from `src/index.ts`:

- Types from `@mariozechner/pi-ai`: `AssistantMessage`, `ImageContent`, `Message`, `Model`, `UserMessage`
- `StringEnum` from `@mariozechner/pi-ai`
- TypeBox exports: `Static`, `TSchema`, `Type`
- Cache helpers: `warmCache` (`./cache/warm.js`)
- Cache stores: `createFileCache`, `createMemoryCache`
- Cache types: `CacheEntry`, `CacheOptions`, `CacheStore`
- Errors: `AbortError`, `CommandValidationError`, `ExtractError`, `HttpValidationError`, `MaxTurnsError`, `SchemaValidationError`
- Setup helpers: `loadExtractionSetup`, `ExtractionSetup`, `LoadExtractionSetupOptions`
- Events: `ExtractEvent`, `ValidatorLayer`
- Core API: `extract`, `extractSync`
- Model registry: `getModel`, `getModels`, `getProviders`
- Recipes: `loadRecipeSetup`, `loadRecipes`, `resolveRecipe`, plus `Recipe`, `RecipeWarning`, `LoadRecipeSetupOptions`, `LoadRecipesOptions`, `LoadRecipesResult`
- Types: `ExtractOptions`, `ExtractResult`, `ExtractStream`, `ThinkingBudgets`, `ThinkingLevel`, `Usage`

## Package Exports Map (package.json)

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./cache": {
    "types": "./dist/cache/index.d.ts",
    "default": "./dist/cache/index.js"
  }
}
```

## CLI Behavior and Exit Codes

- `0`: success (including `--help`, `--version`, `--list-recipes`, `--json-schema`)
- `1`: extraction failed due to `MaxTurnsError`
- `2`: invalid arguments or schema/prompt/config validation issues
- `3`: authentication failures or extraction errors not covered by `MaxTurnsError`
- `4`: IO/config/attachments errors (read/write, config execution, attachment load)

## File Map (Current → Target)

- `src/cli.ts` → `src/cli.ts` (thin entry), `src/main.ts` (orchestration)
- `src/cli/*` → `src/cli/*` (unchanged)
- `src/core/*` → `src/core/*` (unchanged)
- `src/cache/*` → `src/cache/*` (unchanged)
- `src/index.ts` → `src/index.ts` (public exports remain centralized)
- `bin/pie` → `bin/pie` (thin wrapper to `dist/cli.js`)
