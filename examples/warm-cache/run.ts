// Example: compare on-demand cache vs warmCache for online latency
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/warm-cache/run.ts
//
// Or choose provider/model:
//   npx tsx examples/warm-cache/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/warm-cache/run.ts google-antigravity gemini-3-flash

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileCache, extractSync, type Static, Type, warmCache } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const schema = Type.Object({
	category: Type.String(),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

type ExtractedResult = Static<typeof schema>;

const prompt = "Classify the input into a short category label.";
const baseInputs = [
	"Incident: payment service outage",
	"Feature request: add export to CSV",
	"Bug report: login page 500 error",
	"Question: how to reset my password?",
	"Incident: database replication lag",
	"Feature request: add CSV import",
	"Bug report: mobile app crash",
	"Question: billing invoice format",
];
const inputs = baseInputs.map((text, index) => `${text} (#${index + 1})`);

type OnlineBatchResult = {
	totalMs: number;
	firstMs: number;
	avgMs: number;
	results: ExtractedResult[];
};

async function runOnlineBatch(
	label: string,
	batch: string[],
	options: {
		schema: typeof schema;
		prompt: string;
		model: Model<any>;
		apiKey: string;
		cache: { store: ReturnType<typeof createFileCache> };
	},
): Promise<OnlineBatchResult> {
	const results: ExtractedResult[] = [];
	const start = Date.now();
	let firstMs = 0;

	for (let i = 0; i < batch.length; i++) {
		const itemStart = Date.now();
		const result: ExtractedResult = await extractSync(batch[i], options);
		const elapsed = Date.now() - itemStart;
		if (i === 0) {
			firstMs = elapsed;
		}
		results.push(result);
		console.error(`[${label}] item ${i + 1}/${batch.length} took ${elapsed}ms`);
	}

	const totalMs = Date.now() - start;
	const avgMs = Math.round(totalMs / batch.length);
	return { totalMs, firstMs, avgMs, results };
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

	console.error(`Using model: ${provider}:${modelId}`);

	// Scenario A: on-demand cache (online workload, no pre-warm).
	const onDemandDir = mkdtempSync(join(tmpdir(), "pie-cache-on-demand-"));
	const onDemandStore = createFileCache({ directory: onDemandDir });
	console.error(`On-demand cache directory: ${onDemandDir}`);
	console.error("On-demand cache: online batch (first run is cold)...");
	const onDemandCold = await runOnlineBatch("on-demand", inputs, {
		schema,
		prompt,
		model,
		apiKey,
		cache: { store: onDemandStore },
	});
	console.error(
		`On-demand online batch: total=${onDemandCold.totalMs}ms, first=${onDemandCold.firstMs}ms, avg=${onDemandCold.avgMs}ms`,
	);
	onDemandStore.clear();
	console.error("On-demand cache cleared.");

	// Scenario B: warmCache pre-population (offline), then online batch.
	const warmDir = mkdtempSync(join(tmpdir(), "pie-cache-warm-"));
	const warmStore = createFileCache({ directory: warmDir });

	console.error(`Warm cache directory: ${warmDir}`);
	console.error("Warming cache offline...");
	const warmStart = Date.now();
	await warmCache(inputs, {
		schema,
		prompt,
		model,
		apiKey,
		cache: { store: warmStore },
	});
	const warmMs = Date.now() - warmStart;
	console.error(`Warm cache (offline) duration: ${warmMs}ms`);

	console.error("Warm cache: online batch (should hit cache)...");
	const warmOnline = await runOnlineBatch("warm-cache", inputs, {
		schema,
		prompt,
		model,
		apiKey,
		cache: { store: warmStore },
	});
	console.error(
		`Warm cache online batch: total=${warmOnline.totalMs}ms, first=${warmOnline.firstMs}ms, avg=${warmOnline.avgMs}ms`,
	);

	console.error(`Online latency saved vs on-demand: ${Math.max(0, onDemandCold.totalMs - warmOnline.totalMs)}ms`);
	console.error(`Time-to-first-result saved: ${Math.max(0, onDemandCold.firstMs - warmOnline.firstMs)}ms`);
	console.log(JSON.stringify(warmOnline.results[0], null, 2));

	warmStore.clear();
	console.error("Warm cache cleared.");
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
