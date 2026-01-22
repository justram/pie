// Example: podcast summary extraction from a transcript
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/podcast-summary/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/podcast-summary/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/podcast-summary/run.ts google-antigravity gemini-3-flash

import { readFile } from "node:fs/promises";
import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const timestampSchema = Type.String({
	pattern: "^(?:\\d{1,2}:)?\\d{1,2}:\\d{2}$",
	description: "Timestamp from the transcript (mm:ss or hh:mm:ss).",
});

const schema = Type.Object({
	summary: Type.String({ description: "Concise summary (3-5 sentences)." }),
	keyTakeaways: Type.Array(Type.String(), {
		minItems: 3,
		maxItems: 6,
		description: "Key takeaways from the episode.",
	}),
	highlights: Type.Array(
		Type.Object({
			timestamp: timestampSchema,
			title: Type.String(),
			detail: Type.String(),
		}),
		{
			minItems: 2,
			maxItems: 4,
			description: "Timestamped segments from the discussion.",
		},
	),
	quotes: Type.Array(
		Type.Object({
			timestamp: timestampSchema,
			speaker: Type.String(),
			quote: Type.String(),
		}),
		{
			minItems: 1,
			maxItems: 3,
			description: "Notable quotes with timestamps.",
		},
	),
});

type ExtractionResult = Static<typeof schema>;

const prompt = [
	"You are summarizing a podcast transcript with timestamps like [mm:ss].",
	"Ignore sponsor/ads/promotional segments; do not include them.",
	"Use exact timestamps from the transcript for highlights and quotes.",
	"Keep the summary focused on the core discussion and outcomes.",
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

	const transcript = await readFile(new URL("./sample-transcript.txt", import.meta.url), "utf8");
	const apiKey = await ensureOAuthApiKey(provider);

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Starting extraction...");

	const result: ExtractionResult = await extractSync(transcript, {
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
