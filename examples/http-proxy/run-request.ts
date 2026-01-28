// Internal helper for http-proxy example.
// This runs in a child process so HTTP_PROXY is set before pi-ai loads.

import { completeSimple, getModels, type Model } from "@mariozechner/pi-ai";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const provider = process.env.PROXY_PROVIDER as string | undefined;
const modelId = process.env.PROXY_MODEL_ID as string | undefined;
const apiKey = process.env.PROXY_OAUTH_API_KEY as string | undefined;
const input = process.env.PROXY_INPUT ?? "Summarize the line 'proxy demo succeeded' in five words.";

if (!provider || !modelId || !apiKey) {
	throw new Error("PROXY_PROVIDER, PROXY_MODEL_ID, and PROXY_OAUTH_API_KEY are required.");
}

async function main(): Promise<void> {
	setGlobalDispatcher(new EnvHttpProxyAgent());

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const response = await completeSimple(
		model,
		{
			messages: [{ role: "user", content: input, timestamp: Date.now() }],
		},
		{ apiKey },
	);

	const text = response.content.find((block) => block.type === "text")?.text ?? "";
	console.log(text);
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
