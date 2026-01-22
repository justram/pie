// Example: batch question classification with bounded concurrency
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/batch-classification/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/batch-classification/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/batch-classification/run.ts openai-codex gpt-5.2-codex
//
// Optional third arg: concurrency
//   npx tsx examples/batch-classification/run.ts google-antigravity gemini-3-flash 5

import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

const questionTypes = [
	"CONTACT",
	"TIMELINE_QUERY",
	"DOCUMENT_SEARCH",
	"COMPARE_CONTRAST",
	"EMAIL",
	"PHOTOS",
	"SUMMARY",
] as const;

const schema = Type.Object(
	{
		classification: Type.Array(Type.String({ enum: [...questionTypes] }), {
			description: "Predicted question categories.",
		}),
	},
	{
		description: "Question classification result.",
	},
);

type ClassificationResult = Static<typeof schema>;

type QuestionResult = {
	question: string;
	classification: ClassificationResult["classification"];
};

const prompt = [
	"Classify the user question into one or more categories.",
	`Only use the following categories: ${questionTypes.join(", ")}.`,
	"Return only the structured result that matches the schema.",
].join("\n");

const questions = [
	"What was that ai app that I saw on the news the other day?",
	"Can you find the trainline booking email?",
	"What was the book I saw on Amazon yesterday?",
	"Can you speak German?",
	"Do you have access to the meeting transcripts?",
	"What are the recent sites I visited?",
	"What did I do on Monday?",
	"Tell me about today's meeting and how it relates to the email on Monday.",
];

async function runBatch(
	items: string[],
	concurrency: number,
	worker: (item: string, index: number, signal: AbortSignal) => Promise<void>,
): Promise<void> {
	const controller = new AbortController();
	let nextIndex = 0;

	const runWorker = async () => {
		while (true) {
			if (controller.signal.aborted) {
				return;
			}

			const current = nextIndex;
			if (current >= items.length) {
				return;
			}

			nextIndex += 1;

			try {
				await worker(items[current], current, controller.signal);
			} catch (error) {
				controller.abort(error);
				throw error;
			}
		}
	};

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
	await Promise.all(workers);
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg, concurrencyArg] = process.argv.slice(2);

	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const defaultModelId = provider === "openai-codex" ? "gpt-5.2-codex" : "gemini-3-flash";
	const modelId = modelIdArg ?? defaultModelId;
	const concurrency = concurrencyArg ? Number(concurrencyArg) : 5;

	if (!Number.isFinite(concurrency) || concurrency < 1) {
		throw new Error("Concurrency must be a number greater than or equal to 1.");
	}

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const apiKey = await ensureOAuthApiKey(provider);

	console.error(`Using model: ${provider}:${modelId}`);
	console.error(`Starting batch (${questions.length} questions, concurrency ${concurrency})...`);

	await runBatch(questions, concurrency, async (question, index, signal) => {
		const result = await extractSync(question, {
			schema,
			prompt,
			model,
			apiKey,
			signal,
		});

		const output: QuestionResult = {
			question,
			classification: result.classification,
		};

		console.error(`Completed ${index + 1}/${questions.length}`);
		console.log(JSON.stringify(output));
	});

	console.error("Batch complete.");
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
