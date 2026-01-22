import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Writable } from "node:stream";
import {
	getEnvApiKey,
	getOAuthApiKey,
	getOAuthProviders,
	loginAnthropic,
	loginAntigravity,
	loginGeminiCli,
	loginGitHubCopilot,
	loginOpenAICodex,
	type OAuthCredentials,
	type OAuthProvider,
} from "@mariozechner/pi-ai";

const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const OAUTH_PROVIDERS = new Set(getOAuthProviders().map((provider) => provider.id));

export type ApiKeyCredential = {
	type: "api_key";
	key: string;
};

export type OAuthCredential = {
	type: "oauth";
} & OAuthCredentials;

export type AuthCredential = ApiKeyCredential | OAuthCredential;
export type AuthMap = Record<string, AuthCredential | undefined>;

export async function resolveApiKeyForProvider(provider: string, stderr: Writable): Promise<string | undefined> {
	const auth = loadAuth();
	const authKey = await getKeyFromAuth(provider, auth);
	if (authKey) {
		return authKey;
	}

	const envKey = getEnvApiKey(provider);
	if (envKey) {
		return envKey;
	}

	if (!isOAuthProvider(provider)) {
		return undefined;
	}

	return await loginAndResolve(provider, auth, stderr);
}

export function getSupportedOAuthProviders(): string[] {
	return getOAuthProviders()
		.map((provider) => provider.id)
		.sort();
}

export async function loginWithOAuthProvider(provider: string, stderr: Writable): Promise<string> {
	if (!isOAuthProvider(provider)) {
		const supported = getSupportedOAuthProviders().join(", ");
		throw new Error(`Unsupported OAuth provider: ${provider}. Supported: ${supported}`);
	}

	const auth = loadAuth();
	return await loginAndResolve(provider, auth, stderr);
}

function loadAuth(): AuthMap {
	try {
		const raw = readFileSync(AUTH_PATH, "utf-8");
		const parsed = JSON.parse(raw) as AuthMap;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function saveAuth(auth: AuthMap): void {
	const dir = dirname(AUTH_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2), "utf-8");
	chmodSync(AUTH_PATH, 0o600);
}

async function getKeyFromAuth(provider: string, auth: AuthMap): Promise<string | undefined> {
	const entry = auth[provider];
	if (!entry) {
		return undefined;
	}

	if (entry.type === "api_key") {
		return entry.key;
	}

	if (!isOAuthProvider(provider)) {
		return undefined;
	}

	const result = await getOAuthApiKey(provider, oauthCredentials(auth));
	if (!result) {
		return undefined;
	}

	auth[provider] = { type: "oauth", ...result.newCredentials };
	saveAuth(auth);
	return result.apiKey;
}

async function loginAndResolve(provider: OAuthProvider, auth: AuthMap, stderr: Writable): Promise<string> {
	const result = await getOAuthApiKey(provider, oauthCredentials(auth));
	if (result) {
		auth[provider] = { type: "oauth", ...result.newCredentials };
		saveAuth(auth);
		return result.apiKey;
	}

	writeLine(stderr, `[oauth:${provider}] No credentials found in ${AUTH_PATH}. Starting login...`);
	const credentials = await login(provider, stderr);
	auth[provider] = { type: "oauth", ...credentials };
	saveAuth(auth);

	const refreshed = await getOAuthApiKey(provider, oauthCredentials(auth));
	if (!refreshed) {
		throw new Error(`OAuth login completed, but no credentials were returned for ${provider}`);
	}

	auth[provider] = { type: "oauth", ...refreshed.newCredentials };
	saveAuth(auth);

	return refreshed.apiKey;
}

function oauthCredentials(auth: AuthMap): Record<string, OAuthCredentials> {
	const result: Record<string, OAuthCredentials> = {};
	for (const [key, value] of Object.entries(auth)) {
		if (value?.type === "oauth") {
			result[key] = value;
		}
	}
	return result;
}

function isOAuthProvider(provider: string): provider is OAuthProvider {
	return OAUTH_PROVIDERS.has(provider as OAuthProvider);
}

async function login(provider: OAuthProvider, stderr: Writable): Promise<OAuthCredentials> {
	switch (provider) {
		case "anthropic":
			return await loginAnthropic(
				(url) => {
					writeLine(stderr, `[oauth:${provider}] Open this URL to authenticate:`);
					writeLine(stderr, url);
				},
				async () => {
					return await promptOnce("Paste the authorization code:", stderr);
				},
			);
		case "github-copilot":
			return await loginGitHubCopilot({
				onAuth: (url, instructions) => {
					writeLine(stderr, `[oauth:${provider}] Open this URL to authenticate:`);
					writeLine(stderr, url);
					if (instructions) writeLine(stderr, instructions);
				},
				onPrompt: async ({ message }) => {
					return await promptOnce(message, stderr);
				},
				onProgress: (message) => {
					writeLine(stderr, `[oauth:${provider}] ${message}`);
				},
			});
		case "google-gemini-cli":
			return await loginGeminiCli(
				({ url, instructions }) => {
					writeLine(stderr, `[oauth:${provider}] Open this URL to authenticate:`);
					writeLine(stderr, url);
					if (instructions) writeLine(stderr, instructions);
				},
				(message) => {
					writeLine(stderr, `[oauth:${provider}] ${message}`);
				},
				async () => {
					return await promptOnce(
						"Paste the full redirect URL (or press Enter to wait for browser callback):",
						stderr,
					);
				},
			);
		case "google-antigravity":
			return await loginAntigravity(
				({ url, instructions }) => {
					writeLine(stderr, `[oauth:${provider}] Open this URL to authenticate:`);
					writeLine(stderr, url);
					if (instructions) writeLine(stderr, instructions);
				},
				(message) => {
					writeLine(stderr, `[oauth:${provider}] ${message}`);
				},
				async () => {
					return await promptOnce(
						"Paste the full redirect URL (or press Enter to wait for browser callback):",
						stderr,
					);
				},
			);
		case "openai-codex":
			return await loginOpenAICodex({
				onAuth: ({ url, instructions }) => {
					writeLine(stderr, `[oauth:${provider}] Open this URL to authenticate:`);
					writeLine(stderr, url);
					if (instructions) writeLine(stderr, instructions);
				},
				onPrompt: async ({ message }) => {
					return await promptOnce(message, stderr);
				},
				onProgress: (message) => {
					writeLine(stderr, `[oauth:${provider}] ${message}`);
				},
				onManualCodeInput: async () => {
					return await promptOnce("Paste the authorization code:", stderr);
				},
			});
		default:
			throw new Error(`OAuth login flow not implemented for provider: ${provider}.`);
	}
}

async function promptOnce(prompt: string, stderr: Writable): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: stderr });
	return rl.question(`${prompt} `).finally(() => rl.close());
}

function writeLine(stream: Writable, message: string): void {
	stream.write(`${message}\n`);
}
