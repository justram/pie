// Example: schema validation + retries with feedback to the model
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/retry-feedback/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/retry-feedback/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/retry-feedback/run.ts openai-codex gpt-5.2

import { type ExtractEvent, type ExtractOptions, extract, type Static, Type } from "@justram/pie";
import { getModels, type Message, type Model, streamSimple } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "anthropic";

const schema = Type.Object({
	summary: Type.String({ minLength: 10 }),
	score: Type.Number({ minimum: 0, maximum: 1 }),
	labels: Type.Array(Type.String(), { minItems: 2 }),
});

type Extraction = Static<typeof schema>;

const input = "Provide a short summary of this release note: Added user exports and audit logging.";
const prompt = [
	"Extract a structured summary, score, and labels.",
	"Demonstration flow:",
	"1) First attempt: intentionally omit the labels field and return score as a string.",
	"2) After validation feedback, return schema-valid JSON.",
	'3) Also ensure score >= 0.8 and labels include "verified" to satisfy validation.',
].join("\n");

function logProgress(event: ExtractEvent<Extraction>): void {
	switch (event.type) {
		case "start":
			console.error(`Starting extraction (max turns: ${event.maxTurns})`);
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
		case "cache_hit":
		case "cache_miss":
		case "cache_set":
		case "llm_delta":
			break;
	}
}

function createModelFeedbackLogger(): (messages: Message[]) => void {
	let lastFeedback: string | null = null;

	return (messages: Message[]) => {
		const feedback = messages
			.map((message) => messageText(message))
			.filter((text) => text.includes("Validation error"))
			.at(-1);

		if (!feedback || feedback === lastFeedback) {
			return;
		}

		lastFeedback = feedback;
		console.error("\n[model-feedback] Validation feedback sent to the model:");
		console.error(feedback.trim());
		console.error("---");
	};
}

function messageText(message: Message): string {
	if (typeof message.content === "string") {
		return message.content;
	}

	if (Array.isArray(message.content)) {
		return message.content
			.filter((content) => content.type === "text")
			.map((content) => content.text)
			.join("\n");
	}

	return "";
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);

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
	const logModelFeedback = createModelFeedbackLogger();

	const streamFn: ExtractOptions<Extraction>["streamFn"] = (modelInstance, context, options) => {
		logModelFeedback(context.messages as Message[]);
		return streamSimple(modelInstance, context, options);
	};

	const stream = extract(input, {
		schema,
		prompt,
		model,
		apiKey,
		maxTurns: 3,
		streamFn,
		validate: (data: Extraction) => {
			if (data.score < 0.8) {
				throw new Error("score must be >= 0.8 for verified extractions");
			}
			if (!data.labels.includes("verified")) {
				throw new Error('labels must include "verified"');
			}
		},
	});

	let result: Extraction | null = null;
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
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
