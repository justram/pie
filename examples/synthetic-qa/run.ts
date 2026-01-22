// Example: synthetic data generation with pie
//
// This mirrors Instructor's synthetic-data example, but uses pie.
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/synthetic-qa/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/synthetic-qa/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/synthetic-qa/run.ts openai-codex gpt-5.2-codex

import { getModels, type Model } from "@mariozechner/pi-ai";
import { type ExtractEvent, extract, type Static, Type } from "pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

const examplePairs = [
	{ question: "What is the capital of France?", answer: "Paris" },
	{ question: "What is the largest planet in our solar system?", answer: "Jupiter" },
	{ question: "Who wrote 'To Kill a Mockingbird'?", answer: "Harper Lee" },
	{ question: "What element does 'O' represent on the periodic table?", answer: "Oxygen" },
] as const;

const qaSchema = Type.Object(
	{
		question: Type.String(),
		answer: Type.String(),
	},
	{
		description: "A single synthetic question-answer pair.",
	},
);

const schema = Type.Array(qaSchema, {
	description: "Synthetic Q&A examples.",
	minItems: examplePairs.length,
	maxItems: examplePairs.length,
});

type QaPairs = Static<typeof schema>;

type SupportedProvider = "openai-codex" | "google-antigravity";

const fewShotPrompt = [
	"Generate synthetic Q&A examples inspired by the format and topics below.",
	"Do not repeat these exact examples. Create new ones with similar style.",
	"Return the same number of items as the examples.",
	"",
	"Examples:",
	...examplePairs.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`),
].join("\n");

function logProgress(event: ExtractEvent<QaPairs>): void {
	switch (event.type) {
		case "start":
			console.error(`Starting extraction (max turns: ${event.maxTurns})`);
			break;
		case "cache_hit":
			console.error(`Cache hit (${event.key}, age ${Math.round(event.age / 1000)}s)`);
			break;
		case "cache_miss":
			console.error(`Cache miss (${event.key})`);
			break;
		case "turn_start":
			console.error(`Turn ${event.turn} started`);
			break;
		case "llm_start":
			console.error("LLM call started");
			break;
		case "tool_call":
			console.error(`Tool call received (${event.toolCall.name})`);
			break;
		case "json_extracted":
			console.error(`JSON extracted from ${event.source}`);
			break;
		case "validation_start":
			console.error(`Validation started (${event.layer})`);
			break;
		case "validation_pass":
			console.error(`Validation passed (${event.layer})`);
			break;
		case "validation_error":
			console.error(`Validation failed (${event.layer}): ${event.error}`);
			break;
		case "turn_end":
			console.error(`Turn ${event.turn} ended (has result: ${event.hasResult})`);
			break;
		case "complete":
			console.error(`Extraction complete in ${event.turns} turns`);
			console.error("--- Result follows on stdout ---");
			break;
		case "error":
			console.error(`Extraction error after ${event.turns} turns: ${event.error.message}`);
			break;
		case "llm_end":
			console.error(
				`LLM call completed (tokens: ${event.usage.totalTokens}, cost: $${event.usage.cost.toFixed(6)})`,
			);
			break;
		case "thinking":
			console.error("Model requested another turn");
			break;
		case "cache_set":
			console.error(`Cache stored (${event.key})`);
			break;
		case "llm_delta":
			break;
	}
}

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

	const stream = extract<QaPairs>("Generate synthetic examples.", {
		schema,
		prompt: fewShotPrompt,
		model,
		apiKey,
	});

	let result: QaPairs | null = null;
	for await (const event of stream) {
		logProgress(event);
		if (event.type === "complete") {
			result = event.result;
		}
	}

	if (!result) {
		throw new Error("Extraction failed without a result.");
	}

	console.log("\n=== Extraction Result ===");
	console.log("Extracted examples:");
	for (const item of result) {
		console.log(`- ${item.question} -> ${item.answer}`);
	}
	console.log("=== End Result ===");
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
