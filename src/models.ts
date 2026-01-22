/**
 * Model utilities re-exported from pi-ai.
 *
 * Usage:
 * ```typescript
 * import { getModel, getModels, getProviders } from "@justram/pie";
 *
 * // Get specific model
 * const model = getModel("anthropic", "claude-sonnet-4-5");
 *
 * // List all models for a provider
 * const anthropicModels = getModels("anthropic");
 *
 * // List all providers
 * const providers = getProviders();
 * ```
 *
 * This approach avoids hardcoding model IDs which break when pi-ai updates.
 * Users get full type safety from pi-ai's generated model types.
 */
export { getModel, getModels, getProviders } from "@mariozechner/pi-ai";
