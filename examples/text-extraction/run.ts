// Example: text extraction using OAuth-backed providers (Codex / Antigravity)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/text-extraction/run.ts
//
// Or choose provider/model:
//   npx tsx examples/text-extraction/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/text-extraction/run.ts google-antigravity gemini-3-flash

import { getModels, type Model } from "@mariozechner/pi-ai";
import { extractSync, type Static, Type } from "pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const schema = Type.Object({
	sentiment: Type.String({ enum: ["positive", "negative", "neutral"] }),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
	keywords: Type.Array(Type.String()),
});

type ExtractionResult = Static<typeof schema>;

const input = "I love this product. It is fast and reliable.";
const prompt = "Classify sentiment and extract keywords.";

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
