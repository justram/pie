// Example: shell validator command
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/validation-shell/run.ts
//
// Or choose provider/model:
//   npx tsx examples/validation-shell/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/validation-shell/run.ts google-antigravity gemini-3-flash

import { fileURLToPath } from "node:url";
import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const schema = Type.Object({
	summary: Type.String(),
	score: Type.Number({ minimum: 0, maximum: 1 }),
});

type ExtractionResult = Static<typeof schema>;

const input = "This release improves performance and reduces memory usage.";
const prompt = "Summarize the text and return a score between 0 and 1 (>= 0.5).";

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
	const validatorPath = fileURLToPath(new URL("./validate-score.sh", import.meta.url));
	const validateCommand = `bash ${JSON.stringify(validatorPath)}`;

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Starting extraction with shell validation...");

	const result: ExtractionResult = await extractSync(input, {
		schema,
		prompt,
		model,
		apiKey,
		validateCommand,
	});

	console.error("Extraction complete.");
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
