// Example: HTTP validator endpoint
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/validation-http/run.ts
//
// Or choose provider/model:
//   npx tsx examples/validation-http/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/validation-http/run.ts google-antigravity gemini-3-flash

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

type ValidatorServer = {
	url: string;
	close: () => Promise<void>;
};

const schema = Type.Object({
	result: Type.String(),
	score: Type.Number({ minimum: 0, maximum: 1 }),
});

type ExtractionResult = Static<typeof schema>;

const input = "This update improves throughput by 25%.";
const prompt = "Summarize the update and provide a score between 0 and 1 (>= 0.7).";

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function startValidatorServer(): Promise<ValidatorServer> {
	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		if (!req.url || req.url !== "/validate") {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}

		if (req.method !== "POST") {
			res.statusCode = 405;
			res.end("Method not allowed");
			return;
		}

		try {
			const body = await readBody(req);
			const data = JSON.parse(body) as { score?: number };

			if (typeof data.score !== "number") {
				res.statusCode = 400;
				res.end("Missing score field.");
				return;
			}

			if (data.score < 0.7) {
				res.statusCode = 400;
				res.end(`Score too low: ${data.score}`);
				return;
			}

			res.statusCode = 204;
			res.end();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			res.statusCode = 400;
			res.end(message);
		}
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to resolve validator server address.");
	}

	const url = `http://127.0.0.1:${address.port}/validate`;

	return {
		url,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
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
	const server = await startValidatorServer();

	console.error(`Using model: ${provider}:${modelId}`);
	console.error(`Validator server listening at ${server.url}`);
	console.error("Starting extraction with HTTP validation...");

	try {
		const result: ExtractionResult = await extractSync(input, {
			schema,
			prompt,
			model,
			apiKey,
			validateUrl: server.url,
		});

		console.error("Extraction complete.");
		console.log(JSON.stringify(result, null, 2));
	} finally {
		await server.close();
	}
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
