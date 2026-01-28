// Example: HTTP proxy support for the pie CLI (OAuth providers)
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/http-proxy/run-cli.ts
//
// Or choose provider/model:
//   npx tsx examples/http-proxy/run-cli.ts openai-codex gpt-5.2-codex
//   npx tsx examples/http-proxy/run-cli.ts google-antigravity gemini-3-flash

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureOAuthApiKey } from "../_shared/oauth.js";
import { startProxyServer, withProxyEnv } from "./shared.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "google-gemini-cli";

const input = "Proxy CLI example input.";

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

function repoRoot(): string {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return resolve(currentDir, "../..");
}

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

async function runPie(configPath: string): Promise<number> {
	return await new Promise((resolveExit, reject) => {
		const child = spawn("node", ["bin/pie", "--config", configPath], {
			cwd: repoRoot(),
			stdio: ["pipe", "inherit", "inherit"],
			env: process.env,
		});

		child.on("error", reject);
		child.on("exit", (code) => resolveExit(code ?? 0));

		if (child.stdin) {
			child.stdin.write(input);
			child.stdin.end();
		}
	});
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);
	const provider = (providerArg as SupportedProvider | undefined) ?? "openai-codex";
	const modelId = modelIdArg ?? defaultModelId(provider);

	const apiKey = await ensureOAuthApiKey(provider);
	const proxy = await startProxyServer();
	const restoreProxyEnv = withProxyEnv(proxy.url);
	const restoreApiKey = withEnvVar("PROXY_OAUTH_API_KEY", apiKey);
	const restoreProvider = withEnvVar("PROXY_PROVIDER", provider);
	const restoreModel = withEnvVar("PROXY_MODEL_ID", modelId);
	const restoreVersionCheck = withEnvVar("PI_SKIP_VERSION_CHECK", "1");

	const configPath = resolve(repoRoot(), "examples/http-proxy/cli-config.mjs");

	try {
		const exitCode = await runPie(configPath);
		console.error(`Proxy received ${proxy.requests.length} request(s).`);
		console.error(proxy.requests.map((entry) => `- ${entry}`).join("\n"));
		console.error(`CLI exited with code ${exitCode}.`);
	} finally {
		restoreVersionCheck();
		restoreModel();
		restoreProvider();
		restoreApiKey();
		restoreProxyEnv();
		await proxy.close();
	}
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
