import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadExtractionSetup } from "@justram/pie";

import { createModelRouter, stripImagesForTextOnlyModel } from "../_shared/model-router.mjs";

function round2(n) {
	return Math.round(n * 100) / 100;
}

const forceHandoff = process.env.FORCE_HANDOFF === "1";
let forcedOnce = false;

function validateReceipt(data) {
	if (forceHandoff && !forcedOnce) {
		forcedOnce = true;
		throw new Error("Forced validation failure to demonstrate model handoff.");
	}

	const itemTotals = data.lineItems.map((it) => round2(it.quantity * it.unitPrice));
	for (let i = 0; i < data.lineItems.length; i += 1) {
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
				"subtotal mismatch",
				`expected ${subtotalExpected.toFixed(2)} = sum(lineItems.total)`,
				`got ${round2(data.subtotal).toFixed(2)}`,
			].join("; "),
		);
	}

	const totalExpected = round2(subtotalExpected + round2(data.tax));
	if (round2(data.total) !== totalExpected) {
		throw new Error(
			[
				"total mismatch",
				`expected ${totalExpected.toFixed(2)} = subtotal + tax`,
				`got ${round2(data.total).toFixed(2)}`,
			].join("; "),
		);
	}
}

export default async function config({ inputText, attachments, resolveModel, resolveApiKeyForProvider }) {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const setupPath = join(currentDir, "setup.md");
	const setup = loadExtractionSetup(setupPath);

	const visionModel = process.env.VISION_MODEL ? resolveModel(process.env.VISION_MODEL) : setup.options.model;
	const reasoningModel = resolveModel(process.env.REASONING_MODEL ?? "openai-codex/gpt-5.2");

	if (!visionModel.input.includes("image")) {
		throw new Error(`Vision model must support images: ${visionModel.provider}/${visionModel.id}`);
	}

	const visionApiKey = await resolveApiKeyForProvider(visionModel.provider);
	const reasoningApiKey = await resolveApiKeyForProvider(reasoningModel.provider);

	const streamFn = createModelRouter({
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

	const input = inputText.trim().length > 0 ? inputText : "Extract the receipt.";

	return {
		input,
		options: {
			...setup.options,
			model: visionModel,
			apiKey: visionApiKey,
			maxTurns: 4,
			streamFn,
			attachments: attachments.images,
			validate: validateReceipt,
		},
	};
}
