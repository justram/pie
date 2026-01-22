// Example: CRM search query generation with pie
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/crm-search/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/crm-search/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/crm-search/run.ts openai-codex gpt-5.2-codex

import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const crmSearch = Type.Object(
	{
		source: Type.String({ enum: ["personal", "business", "work_contacts", "all"] }),
		city_location: Type.String({ description: "City location used to match the desired customer profile" }),
		search_description: Type.String({ description: "Search query used to match the desired customer profile" }),
	},
	{
		description: "A CRM search query.",
	},
);

const schema = Type.Object(
	{
		queries: Type.Array(crmSearch),
	},
	{
		description:
			"A set of CRM queries to execute. For large locations, decompose into smaller city-specific queries.",
	},
);

type ExtractionResult = Static<typeof schema>;

const input = "find me all the pottery businesses in San Francisco and my friends in the east coast big cities";
const prompt = [
	"You are a world class CRM search query generator.",
	"Decompose the user request into a set of CRM search queries.",
	"For large regions, break down into specific cities.",
].join("\n");

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);

	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const defaultModelId = provider === "openai-codex" ? "gpt-5.2-codex" : "gemini-3-flash";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const apiKey = await ensureOAuthApiKey(provider);

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Starting extraction...");

	const result: ExtractionResult = await extractSync(input, {
		schema,
		prompt,
		model,
		apiKey,
	});

	console.error("Extraction complete.");
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
