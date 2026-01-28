import { completeSimple } from "@mariozechner/pi-ai";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const baseUrl = process.env.MOCK_BASE_URL;
if (!baseUrl) {
	throw new Error("MOCK_BASE_URL is required for http proxy test worker.");
}

async function main() {
	setGlobalDispatcher(new EnvHttpProxyAgent());

	const model = {
		id: "proxy-test-model",
		name: "Proxy Test Model",
		api: "openai-completions",
		provider: "proxy-test",
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 256,
	};

	const response = await completeSimple(
		model,
		{
			messages: [{ role: "user", content: "Ping", timestamp: Date.now() }],
		},
		{ apiKey: "test-key" },
	);

	const text = response.content.find((block) => block.type === "text")?.text ?? "";
	console.log(text);
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
