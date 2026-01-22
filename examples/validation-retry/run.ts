// Example: validation error first, then success (shell validator)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/validation-retry/run.ts
//
// Or choose provider/model:
//   npx tsx examples/validation-retry/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/validation-retry/run.ts google-antigravity gemini-3-flash

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extract, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const schema = Type.Object({
	summary: Type.String(),
	score: Type.Number({ minimum: 0, maximum: 1 }),
});

const input = "This release improves performance and reduces memory usage.";
const prompt = "Summarize the text and return a score between 0 and 1.";

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
	const validatorPath = fileURLToPath(new URL("./validate-first-fail.sh", import.meta.url));
	const tempDir = mkdtempSync(join(tmpdir(), "pie-validation-"));
	const sentinelPath = join(tempDir, "first-failure.txt");
	const validateCommand = `PIE_VALIDATION_SENTINEL=${JSON.stringify(sentinelPath)} bash ${JSON.stringify(validatorPath)}`;

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Starting extraction with a validator that fails once...");

	const stream = extract(input, {
		schema,
		prompt,
		model,
		apiKey,
		maxTurns: 3,
		validateCommand,
	});

	for await (const event of stream) {
		if (event.type === "validation_error") {
			console.error(`[validation_error:${event.layer}] ${event.error}`);
		}
		if (event.type === "turn_start") {
			console.error(`[turn] ${event.turn}`);
		}
		if (event.type === "turn_end") {
			console.error(`[turn] ${event.turn} complete (success=${event.hasResult})`);
		}
	}

	const result = await stream.result();
	if (!result) {
		throw new Error("Extraction failed.");
	}

	console.error("Extraction complete.");
	console.log(JSON.stringify(result.data, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
