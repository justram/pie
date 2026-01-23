// Example: summarize HN top stories into structured insights.
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/hn-insights/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/hn-insights/run.ts google-antigravity claude-sonnet-4-5
//
// List models:
//   pie --list-models --models-provider google-antigravity

import { extractSync, Type } from "@justram/pie";
import { createFileCache } from "@justram/pie/cache";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "google-antigravity";

type Story = {
	id: number;
	title: string;
	url?: string;
	by: string;
	score: number;
	descendants?: number;
	time: number;
};

const schema = Type.Object({
	date: Type.String(),
	topics: Type.Array(Type.String(), { minItems: 3 }),
	sentiment: Type.Union([Type.Literal("optimistic"), Type.Literal("neutral"), Type.Literal("cautious")]),
	keyThemes: Type.Array(
		Type.Object({
			theme: Type.String(),
			summary: Type.String(),
			evidence: Type.Array(Type.String(), { minItems: 1 }),
		}),
		{ minItems: 3 },
	),
	highlightedStories: Type.Array(
		Type.Object({
			title: Type.String(),
			url: Type.String(),
			whyItMatters: Type.String(),
		}),
		{ minItems: 5 },
	),
});

const cache = createFileCache({ directory: "./cache" });

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_RETRIES = 3;

async function fetchJson<T>(url: string, label: string): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText}`);
			}
			return (await res.json()) as T;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.error(`[fetch] ${label} failed (attempt ${attempt}/${FETCH_RETRIES}): ${lastError.message}`);
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error(`[fetch] ${label} failed after ${FETCH_RETRIES} attempts: ${lastError?.message ?? "unknown error"}`);
}

async function fetchTopStoryIds(): Promise<number[]> {
	return await fetchJson<number[]>("https://hacker-news.firebaseio.com/v0/topstories.json", "topstories");
}

async function fetchStory(id: number): Promise<Story> {
	return await fetchJson<Story>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, `story:${id}`);
}

function buildInput(stories: Story[], date: string): string {
	const lines = stories.map((s) => {
		const url = s.url ?? `https://news.ycombinator.com/item?id=${s.id}`;
		return [
			`Title: ${s.title}`,
			`URL: ${url}`,
			`Author: ${s.by}`,
			`Score: ${s.score}`,
			`Comments: ${s.descendants ?? 0}`,
		].join("\n");
	});

	return [
		`Date: ${date}`,
		"Source: Hacker News top stories",
		"",
		"Stories:",
		...lines.map((l, i) => `#${i + 1}\n${l}`),
	].join("\n\n");
}

async function extractInsightsForToday(model: Model<any>, apiKey: string) {
	const today = new Date().toISOString().slice(0, 10);
	const ids = await fetchTopStoryIds();

	const results = await Promise.allSettled(ids.slice(0, 30).map(fetchStory));
	const stories = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

	if (stories.length === 0) {
		throw new Error("No stories fetched from Hacker News.");
	}

	const input = buildInput(stories, today);

	return await extractSync(input, {
		schema,
		prompt:
			"Summarize today's Hacker News. " +
			"Identify key themes, the dominant topics, and overall sentiment. " +
			"Highlight the most impactful stories and explain why they matter. " +
			"Use story titles as evidence where possible.",
		model,
		apiKey,
		cache: { store: cache },
	});
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);

	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const modelId = modelIdArg ?? "claude-sonnet-4-5";

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const apiKey = await ensureOAuthApiKey(provider);

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Starting extraction...");

	const insights = await extractInsightsForToday(model, apiKey);
	console.error("Extraction complete.");
	console.log(JSON.stringify(insights, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
