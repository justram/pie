import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { completeSimple, type Model } from "@mariozechner/pi-ai";

type ServerHandle = {
	url: string;
	close: () => Promise<void>;
};

type ProxyHandle = ServerHandle & {
	requests: string[];
};

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function startMockOpenAi(): Promise<ServerHandle> {
	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		if (!req.url || req.url !== "/v1/chat/completions") {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}

		if (req.method !== "POST") {
			res.statusCode = 405;
			res.end("Method not allowed");
			return;
		}

		await readBody(req);

		res.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		});

		const payload = {
			id: "chatcmpl-proxy-test",
			object: "chat.completion.chunk",
			created: Math.floor(Date.now() / 1000),
			model: "proxy-test-model",
			choices: [
				{
					index: 0,
					delta: { role: "assistant", content: "Proxy path confirmed." },
					finish_reason: "stop",
				},
			],
		};

		res.write(`data: ${JSON.stringify(payload)}\n\n`);
		res.write("data: [DONE]\n\n");
		res.end();
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to resolve mock server address.");
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}

async function startProxyServer(): Promise<ProxyHandle> {
	const requests: string[] = [];
	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		if (!req.url) {
			res.statusCode = 400;
			res.end("Missing URL");
			return;
		}

		requests.push(req.url);
		const targetUrl = req.url.startsWith("http") ? new URL(req.url) : new URL(req.url, "http://localhost");

		const proxyReq = createServerRequest(targetUrl, req, res);
		req.pipe(proxyReq);
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to resolve proxy server address.");
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		requests,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}

function createServerRequest(targetUrl: URL, req: IncomingMessage, res: ServerResponse) {
	const proxyReq = request(
		{
			hostname: targetUrl.hostname,
			port: targetUrl.port,
			path: `${targetUrl.pathname}${targetUrl.search}`,
			method: req.method,
			headers: { ...req.headers, host: targetUrl.host },
		},
		(proxyRes) => {
			res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
			proxyRes.pipe(res);
		},
	);

	proxyReq.on("error", (error) => {
		res.statusCode = 502;
		res.end(error.message);
	});

	return proxyReq;
}

function withProxyEnv(proxyUrl: string): () => void {
	const prevHttp = process.env.HTTP_PROXY;
	const prevHttpLower = process.env.http_proxy;
	const prevNoProxy = process.env.NO_PROXY;
	const prevNoProxyLower = process.env.no_proxy;

	process.env.HTTP_PROXY = proxyUrl;
	process.env.http_proxy = proxyUrl;
	delete process.env.NO_PROXY;
	delete process.env.no_proxy;

	return () => {
		if (prevHttp === undefined) {
			delete process.env.HTTP_PROXY;
		} else {
			process.env.HTTP_PROXY = prevHttp;
		}

		if (prevHttpLower === undefined) {
			delete process.env.http_proxy;
		} else {
			process.env.http_proxy = prevHttpLower;
		}

		if (prevNoProxy === undefined) {
			delete process.env.NO_PROXY;
		} else {
			process.env.NO_PROXY = prevNoProxy;
		}

		if (prevNoProxyLower === undefined) {
			delete process.env.no_proxy;
		} else {
			process.env.no_proxy = prevNoProxyLower;
		}
	};
}

describe("http proxy environment", () => {
	it("routes api requests through HTTP_PROXY", async () => {
		const mock = await startMockOpenAi();
		const proxy = await startProxyServer();
		const restoreEnv = withProxyEnv(proxy.url);

		const model: Model<"openai-completions"> = {
			id: "proxy-test-model",
			name: "Proxy Test Model",
			api: "openai-completions",
			provider: "proxy-test",
			baseUrl: `${mock.url}/v1`,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 8192,
			maxTokens: 256,
		};

		try {
			const response = await completeSimple(
				model,
				{
					messages: [{ role: "user", content: "Ping", timestamp: Date.now() }],
				},
				{ apiKey: "test-key" },
			);

			const text = response.content.find((block) => block.type === "text")?.text;
			expect(text).toBe("Proxy path confirmed.");
			expect(proxy.requests.length).toBeGreaterThan(0);
			expect(proxy.requests[0]).toContain(mock.url);
		} finally {
			restoreEnv();
			await proxy.close();
			await mock.close();
		}
	});
});
