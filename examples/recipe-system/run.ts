// Example: recipe system (discover + load + extract)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/recipe-system/run.ts
//
// Or choose a recipe explicitly:
//   npx tsx examples/recipe-system/run.ts support-triage
//   npx tsx examples/recipe-system/run.ts issue-summary
//   npx tsx examples/recipe-system/run.ts action-plan
//
// Or choose provider/model explicitly:
//   npx tsx examples/recipe-system/run.ts support-triage openai-codex gpt-5.2
//   npx tsx examples/recipe-system/run.ts issue-summary google-antigravity gemini-3-flash
//   npx tsx examples/recipe-system/run.ts action-plan anthropic claude-sonnet-4

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { extractSync, getModels, loadRecipeSetup, loadRecipes, type Model } from "@justram/pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "anthropic";

type ExtractionResult = {
	summary: string;
	sentiment: "positive" | "neutral" | "negative";
	issues: Array<{ area: string; detail: string; severity: "low" | "medium" | "high" }>;
	actionItems: Array<{ owner: string; task: string; dueDate?: string }>;
	quotes?: string[];
};

const input = [
	"Ticket 1287:",
	"- Customer reports intermittent 500 errors after login.",
	"- Impact is high during peak hours; retries sometimes succeed.",
	"- Customer asked for an ETA and workaround.",
	"- Agent suggested clearing cache; no improvement.",
	"- Engineering suspects a load balancer timeout.",
	"- Follow-up scheduled with Alex by Friday.",
].join("\n");

async function main(): Promise<void> {
	const [firstArg, secondArg, thirdArg] = process.argv.slice(2);
	const recipeName =
		firstArg === "support-triage" || firstArg === "issue-summary" || firstArg === "action-plan"
			? firstArg
			: "support-triage";
	const providerArg = recipeName === firstArg ? secondArg : firstArg;
	const modelIdArg = recipeName === firstArg ? thirdArg : secondArg;
	const provider = (providerArg as SupportedProvider | undefined) ?? "openai-codex";

	const defaultModelId =
		provider === "openai-codex"
			? "gpt-5.2"
			: provider === "google-antigravity"
				? "gemini-3-flash"
				: "claude-sonnet-4";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}/${modelId}`);
	}

	const apiKey =
		provider === "openai-codex" || provider === "google-antigravity" ? await ensureOAuthApiKey(provider) : undefined;

	console.error(`Using model: ${provider}:${modelId}`);

	const currentDir = dirname(fileURLToPath(import.meta.url));
	const { recipes, warnings } = loadRecipes({ cwd: currentDir });
	for (const warning of warnings) {
		console.error(`[recipe warning] ${warning.recipePath}: ${warning.message}`);
	}

	const recipe = recipes.find((entry) => entry.name === recipeName);
	if (!recipe) {
		throw new Error(`Recipe not found: ${recipeName}`);
	}

	const recipeVars =
		recipeName === "support-triage"
			? { max_quotes: 2 }
			: recipeName === "issue-summary"
				? { max_steps: 4 }
				: { max_steps: 5 };

	const setup = loadRecipeSetup<ExtractionResult>(recipe, {
		vars: recipeVars,
		overrides: { model, apiKey },
	});

	console.error("Starting extraction...");
	const result: ExtractionResult = await extractSync(input, setup.options);
	console.error("Extraction complete.");
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
