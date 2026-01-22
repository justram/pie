// Example: caching extractions with a file-backed cache
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/caching/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/caching/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/caching/run.ts openai-codex gpt-5.2-codex

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { getModels, type Model } from "@mariozechner/pi-ai";
import { createFileCache, type ExtractEvent, extract, Type } from "pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const schema = Type.Object({
	sentiment: Type.String({ enum: ["positive", "negative", "neutral"] }),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
	keywords: Type.Array(Type.String()),
});

const input = "I love this product. It is fast and reliable.";
const prompt = "Classify sentiment and extract keywords.";

async function runOnce(options: {
	label: string;
	model: Model<any>;
	apiKey: string;
	cache: ReturnType<typeof createFileCache>;
}): Promise<{ result: unknown; durationMs: number }> {
	const start = performance.now();
	const stream = extract(input, {
		schema,
		prompt,
		model: options.model,
		apiKey: options.apiKey,
		cache: {
			store: options.cache,
			ttl: 5 * 60 * 1000,
		},
	});

	let result: unknown | null = null;
	for await (const event of stream) {
		logProgress(options.label, event);
		if (event.type === "complete") {
			result = event.result;
		}
	}

	if (!result) {
		throw new Error(`Extraction failed (${options.label})`);
	}

	const durationMs = performance.now() - start;
	return { result, durationMs };
}

function logProgress(label: string, event: ExtractEvent<unknown>): void {
	switch (event.type) {
		case "cache_hit":
			console.error(`[${label}] Cache hit (${event.key}, age ${Math.round(event.age / 1000)}s)`);
			break;
		case "cache_miss":
			console.error(`[${label}] Cache miss (${event.key})`);
			break;
		case "cache_set":
			console.error(`[${label}] Cache stored (${event.key})`);
			break;
		case "llm_start":
			console.error(`[${label}] LLM call started`);
			break;
		case "llm_end":
			console.error(
				`[${label}] LLM call completed (tokens: ${event.usage.totalTokens}, cost: $${event.usage.cost.toFixed(6)})`,
			);
			break;
		case "error":
			console.error(`[${label}] Extraction error: ${event.error.message}`);
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

	const cacheDir = resolve("examples/caching/.cache");
	mkdirSync(cacheDir, { recursive: true });

	const cache = createFileCache({ directory: cacheDir });
	await cache.clear();
	console.log(`Cache cleared: ${cacheDir}`);

	console.log("=== First run (expect cache miss) ===");
	const first = await runOnce({ label: "first", model, apiKey, cache });
	console.log(JSON.stringify(first.result, null, 2));
	console.log(`First run duration: ${Math.round(first.durationMs)}ms`);

	console.log("\n=== Second run (expect cache hit) ===");
	const second = await runOnce({ label: "second", model, apiKey, cache });
	console.log(JSON.stringify(second.result, null, 2));
	console.log(`Second run duration: ${Math.round(second.durationMs)}ms`);

	const delta = first.durationMs - second.durationMs;
	console.log(`\nTime saved: ${Math.round(delta)}ms`);
	console.log(`Cache directory: ${cacheDir}`);
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
