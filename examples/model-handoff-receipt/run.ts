// Example: cross-provider model handoff inside a single pie loop
//
// Turn 1 (vision): read a receipt image (Gemini)
// Turn 2+ (reasoning): fix arithmetic / logic issues based on validator feedback (Codex)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/model-handoff-receipt/run.ts
//
// Or choose models explicitly:
//   npx tsx examples/model-handoff-receipt/run.ts google-antigravity gemini-3-flash openai-codex gpt-5.2

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ExtractEvent, type ExtractOptions, extract, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { createModelRouter, stripImagesForTextOnlyModel } from "../_shared/model-router.mjs";
import { ensureOAuthApiKey } from "../_shared/oauth.js";

import { generateReceiptPng } from "./generate-receipt.js";

type SupportedProvider = "google-antigravity" | "openai-codex" | "anthropic";

// -----------------------------
// Schema & validation
// -----------------------------
const schema = Type.Object({
	merchant: Type.String(),
	currency: Type.String({ enum: ["USD"] }),
	orderId: Type.String(),
	date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
	lineItems: Type.Array(
		Type.Object({
			description: Type.String(),
			quantity: Type.Integer({ minimum: 1 }),
			unitPrice: Type.Number({ minimum: 0 }),
			total: Type.Number({ minimum: 0 }),
		}),
		{ minItems: 2 },
	),
	subtotal: Type.Number({ minimum: 0 }),
	tax: Type.Number({ minimum: 0 }),
	total: Type.Number({ minimum: 0 }),
});

type Receipt = Static<typeof schema>;

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function validateReceipt(data: Receipt): void {
	const itemTotals = data.lineItems.map((it) => round2(it.quantity * it.unitPrice));
	for (let i = 0; i < data.lineItems.length; i++) {
		const expectedTotal = itemTotals[i];
		const gotTotal = round2(data.lineItems[i].total);
		if (expectedTotal !== gotTotal) {
			throw new Error(
				[
					`lineItems[${i}].total mismatch`,
					`expected ${expectedTotal.toFixed(2)} = quantity*unitPrice`,
					`got ${gotTotal.toFixed(2)}`,
				].join("; "),
			);
		}
	}

	const subtotalExpected = round2(itemTotals.reduce((a, b) => a + b, 0));
	if (round2(data.subtotal) !== subtotalExpected) {
		throw new Error(
			[
				`subtotal mismatch`,
				`expected ${subtotalExpected.toFixed(2)} = sum(lineItems.total)`,
				`got ${round2(data.subtotal).toFixed(2)}`,
			].join("; "),
		);
	}

	const totalExpected = round2(subtotalExpected + round2(data.tax));
	if (round2(data.total) !== totalExpected) {
		throw new Error(
			[
				`total mismatch`,
				`expected ${totalExpected.toFixed(2)} = subtotal + tax`,
				`got ${round2(data.total).toFixed(2)}`,
			].join("; "),
		);
	}
}

// -----------------------------
// Event logging
// -----------------------------
function logProgress(event: ExtractEvent<Receipt>): void {
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
		case "llm_selected":
			console.error(`LLM selected: ${event.model.provider}:${event.model.id}`);
			break;
		case "llm_end":
			console.error(
				`LLM call completed (tokens: ${event.usage.totalTokens}, cost: $${event.usage.cost.toFixed(6)})`,
			);
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
			break;
		case "thinking":
			console.error("Model requested another turn");
			break;
		case "error":
			console.error(`Extraction error after ${event.turns} turns: ${event.error.message}`);
			break;
		case "cache_hit":
		case "cache_miss":
		case "cache_set":
		case "llm_delta":
			break;
	}
}

async function main(): Promise<void> {
	// -----------------------------
	// CLI args & model setup
	// -----------------------------
	const [visionProviderArg, visionModelIdArg, reasoningProviderArg, reasoningModelIdArg] = process.argv.slice(2);

	const visionProvider: SupportedProvider =
		(visionProviderArg as SupportedProvider | undefined) ?? "google-antigravity";
	const reasoningProvider: SupportedProvider =
		(reasoningProviderArg as SupportedProvider | undefined) ?? "openai-codex";

	const visionModelId =
		visionModelIdArg ?? (visionProvider === "google-antigravity" ? "gemini-3-flash" : "gpt-5.2-codex");
	const reasoningModelId =
		reasoningModelIdArg ??
		(reasoningProvider === "openai-codex"
			? "gpt-5.2"
			: reasoningProvider === "anthropic"
				? "claude-sonnet-4"
				: "gemini-3-flash");

	const visionModel = getModels(visionProvider).find((m) => m.id === visionModelId) as Model<any> | undefined;
	if (!visionModel) {
		throw new Error(`Unknown vision model: ${visionProvider}:${visionModelId}`);
	}
	const reasoningModel = getModels(reasoningProvider).find((m) => m.id === reasoningModelId) as Model<any> | undefined;
	if (!reasoningModel) {
		throw new Error(`Unknown reasoning model: ${reasoningProvider}:${reasoningModelId}`);
	}

	if (!visionModel.input.includes("image")) {
		throw new Error(`Vision model must support images: ${visionProvider}:${visionModelId}`);
	}

	const visionApiKey =
		visionProvider === "google-antigravity" || visionProvider === "openai-codex"
			? await ensureOAuthApiKey(visionProvider)
			: undefined;

	const reasoningApiKey =
		reasoningProvider === "google-antigravity" || reasoningProvider === "openai-codex"
			? await ensureOAuthApiKey(reasoningProvider)
			: undefined;

	// -----------------------------
	// Generate receipt image
	// -----------------------------
	const { png, expected } = generateReceiptPng();
	const imgPath = resolve("examples/model-handoff-receipt/receipt.png");
	writeFileSync(imgPath, png);

	const imageBase64 = readFileSync(imgPath).toString("base64");

	// -----------------------------
	// Model handoff via streamFn
	// -----------------------------
	const streamFn: ExtractOptions<Receipt>["streamFn"] = createModelRouter({
		selectModel: ({ turn }) => (turn === 1 ? visionModel : reasoningModel),
		selectApiKey: (model) => (model === visionModel ? visionApiKey : reasoningApiKey),
		transformContext: ({ model, context }) =>
			model.input.includes("image")
				? context
				: {
						...context,
						messages: stripImagesForTextOnlyModel(context.messages),
					},
	});

	// -----------------------------
	// Extraction
	// -----------------------------
	const prompt = [
		"Extract structured data from the receipt image.",
		"Rules:",
		"- Use currency USD.",
		"- Parse quantities and prices as numbers.",
		"- Ensure arithmetic is consistent:",
		"  - lineItems[i].total = quantity * unitPrice",
		"  - subtotal = sum(lineItems.total)",
		"  - total = subtotal + tax",
		"- If validation feedback indicates a mismatch, correct the numbers to satisfy the constraints.",
	].join("\n");

	const stream = extract<Receipt>("Extract the receipt.", {
		schema,
		prompt,
		model: visionModel,
		maxTurns: 4,
		streamFn,
		attachments: [
			{
				type: "image",
				mimeType: "image/png",
				data: imageBase64,
			},
		],
		validate: validateReceipt,
	});

	let result: Receipt | null = null;
	for await (const event of stream) {
		logProgress(event);
		if (event.type === "complete") {
			result = event.result;
		}
	}

	if (!result) {
		throw new Error("Extraction failed without a result.");
	}

	console.log(JSON.stringify({ extracted: result, expectedApprox: expected, imagePath: imgPath }, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
