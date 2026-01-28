const provider = process.env.PROXY_PROVIDER ?? "openai-codex";
const modelId = process.env.PROXY_MODEL_ID ?? "gpt-5.2-codex";
const apiKey = process.env.PROXY_OAUTH_API_KEY;

if (!apiKey) {
	throw new Error("PROXY_OAUTH_API_KEY is required for the HTTP proxy CLI example.");
}

const schema = {
	type: "object",
	properties: {
		message: { type: "string" },
	},
	required: ["message"],
};

export default function config({ input, resolveModel }) {
	const model = resolveModel(`${provider}/${modelId}`);

	return {
		input,
		options: {
			schema,
			prompt: "Respond with JSON: { \"message\": string } summarizing the input.",
			model,
			apiKey,
			maxTurns: 1,
		},
	};
}
