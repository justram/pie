import { createServer, type IncomingMessage, request, type ServerResponse } from "node:http";
import { connect } from "node:net";

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

export async function startMockOpenAi(): Promise<ServerHandle> {
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
			id: "chatcmpl-proxy",
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

export async function startProxyServer(): Promise<ProxyHandle> {
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

	server.on("connect", (req, clientSocket, head) => {
		if (!req.url) {
			clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
			clientSocket.end();
			return;
		}

		requests.push(`CONNECT ${req.url}`);
		const [host, portValue] = req.url.split(":");
		const port = portValue ? Number.parseInt(portValue, 10) : 443;

		if (!host || !Number.isFinite(port)) {
			clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
			clientSocket.end();
			return;
		}

		const targetSocket = connect(port, host, () => {
			clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			if (head.length > 0) {
				targetSocket.write(head);
			}
			clientSocket.pipe(targetSocket);
			targetSocket.pipe(clientSocket);
		});

		targetSocket.on("error", (error) => {
			clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n${error.message}`);
			clientSocket.end();
		});

		clientSocket.on("error", () => {
			targetSocket.end();
		});
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

export function withProxyEnv(proxyUrl: string): () => void {
	const prevHttp = process.env.HTTP_PROXY;
	const prevHttpLower = process.env.http_proxy;
	const prevHttps = process.env.HTTPS_PROXY;
	const prevHttpsLower = process.env.https_proxy;
	const prevNoProxy = process.env.NO_PROXY;
	const prevNoProxyLower = process.env.no_proxy;

	process.env.HTTP_PROXY = proxyUrl;
	process.env.http_proxy = proxyUrl;
	process.env.HTTPS_PROXY = proxyUrl;
	process.env.https_proxy = proxyUrl;
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

		if (prevHttps === undefined) {
			delete process.env.HTTPS_PROXY;
		} else {
			process.env.HTTPS_PROXY = prevHttps;
		}

		if (prevHttpsLower === undefined) {
			delete process.env.https_proxy;
		} else {
			process.env.https_proxy = prevHttpsLower;
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

export type { ProxyHandle, ServerHandle };
