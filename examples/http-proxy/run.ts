// Example: HTTP proxy support for API requests (OAuth providers)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/http-proxy/run.ts
//
// Or choose provider/model:
//   npx tsx examples/http-proxy/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/http-proxy/run.ts google-antigravity gemini-3-flash

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

import { startProxyServer, withProxyEnv } from "./shared.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "google-gemini-cli";

const input = "Summarize the line 'proxy demo succeeded' in five words.";

function defaultModelId(provider: SupportedProvider): string {
	switch (provider) {
		case "google-antigravity":
			return "gemini-3-flash";
		case "google-gemini-cli":
			return "gemini-2.5-flash";
		default:
			return "gpt-5.2-codex";
	}
}

function repoRoot(): string {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return resolve(currentDir, "../..");
}

async function runRequest(): Promise<number> {
	return await new Promise((resolveExit, reject) => {
		const child = spawn("npx", ["tsx", "examples/http-proxy/run-request.ts"], {
			cwd: repoRoot(),
			stdio: "inherit",
			env: process.env,
		});

		child.on("error", reject);
		child.on("exit", (code) => resolveExit(code ?? 0));
	});
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);
	const provider = (providerArg as SupportedProvider | undefined) ?? "openai-codex";
	const modelId = modelIdArg ?? defaultModelId(provider);

	const apiKey = await ensureOAuthApiKey(provider);
	const proxy = await startProxyServer();
	const restoreProxyEnv = withProxyEnv(proxy.url);
	const restoreProvider = withEnvVar("PROXY_PROVIDER", provider);
	const restoreModel = withEnvVar("PROXY_MODEL_ID", modelId);
	const restoreKey = withEnvVar("PROXY_OAUTH_API_KEY", apiKey);
	const restoreInput = withEnvVar("PROXY_INPUT", input);

	try {
		const exitCode = await runRequest();
		console.error(`Proxy received ${proxy.requests.length} request(s).`);
		console.error(proxy.requests.map((entry) => `- ${entry}`).join("\n"));
		console.error(`SDK request exited with code ${exitCode}.`);
	} finally {
		restoreInput();
		restoreKey();
		restoreModel();
		restoreProvider();
		restoreProxyEnv();
		await proxy.close();
	}
}

function withEnvVar(key: string, value: string): () => void {
	const previous = process.env[key];
	process.env[key] = value;
	return () => {
		if (previous === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = previous;
		}
	};
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
