// Example: run a small matrix of providers/models using OAuth
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/provider-matrix/run.ts

import { getModels, type Model } from "@mariozechner/pi-ai";
import { type ExtractResult, extract, Type, type Usage } from "pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

const INPUT = "I love this product. It is fast and reliable.";
const PROMPT = "Classify sentiment and extract keywords.";

const CODEX_MODELS = ["gpt-5.2-codex", "gpt-5.2", "gpt-5.1-codex-mini"] as const;

type ProviderId = "openai-codex" | "google-antigravity";

type ResultLine = {
	provider: ProviderId;
	modelId: string;
	ok: boolean;
	data?: unknown;
	turns?: number;
	usage?: Usage;
	error?: string;
};

const schema = Type.Object({
	sentiment: Type.String({ enum: ["positive", "negative", "neutral"] }),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
	keywords: Type.Array(Type.String()),
});

async function runExtraction(provider: ProviderId, modelId: string, apiKey: string): Promise<ExtractResult<unknown>> {
	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const stream = extract(INPUT, {
		schema,
		prompt: PROMPT,
		model,
		apiKey,
	});
	const result = await stream.result();
	if (!result) {
		throw new Error("Extraction failed with no result");
	}
	return result;
}

async function main(): Promise<void> {
	const codexApiKey = await ensureOAuthApiKey("openai-codex");
	const antigravityApiKey = await ensureOAuthApiKey("google-antigravity");

	const antigravityModels = getModels("google-antigravity").map((m) => m.id);

	const tasks: Array<{ provider: ProviderId; modelId: string; apiKey: string }> = [
		...CODEX_MODELS.map((modelId) => ({ provider: "openai-codex" as const, modelId, apiKey: codexApiKey })),
		...antigravityModels.map((modelId) => ({
			provider: "google-antigravity" as const,
			modelId,
			apiKey: antigravityApiKey,
		})),
	];

	for (const task of tasks) {
		console.error(`Running ${task.provider}:${task.modelId}`);
		const line: ResultLine = { provider: task.provider, modelId: task.modelId, ok: false };
		try {
			const result = await runExtraction(task.provider, task.modelId, task.apiKey);
			line.ok = true;
			line.data = result.data;
			line.turns = result.turns;
			line.usage = result.usage;
		} catch (error) {
			line.error = error instanceof Error ? error.message : String(error);
		}

		console.log(JSON.stringify(line));
	}
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
