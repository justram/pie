import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import {
	getOAuthApiKey,
	loginAntigravity,
	loginGeminiCli,
	loginOpenAICodex,
	type OAuthCredentials,
	type OAuthProvider,
} from "@mariozechner/pi-ai";

export const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

export type AuthMap = Record<string, ({ type: "oauth" } & OAuthCredentials) | undefined>;

function promptOnce(prompt: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	return rl.question(prompt).finally(() => rl.close());
}

export function loadAuth(): AuthMap {
	try {
		const raw = readFileSync(AUTH_PATH, "utf-8");
		return JSON.parse(raw) as AuthMap;
	} catch {
		return {};
	}
}

export function saveAuth(auth: AuthMap): void {
	writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2), "utf-8");
}

async function login(provider: OAuthProvider): Promise<OAuthCredentials> {
	switch (provider) {
		case "openai-codex":
			return await loginOpenAICodex({
				onAuth: ({ url, instructions }) => {
					console.error(`[oauth:${provider}] Open this URL to authenticate:`);
					console.error(url);
					if (instructions) console.error(instructions);
				},
				onPrompt: async ({ message }) => {
					return await promptOnce(`${message} `);
				},
				onProgress: (message) => {
					console.error(`[oauth:${provider}] ${message}`);
				},
			});

		case "google-antigravity":
			return await loginAntigravity(
				({ url, instructions }) => {
					console.error(`[oauth:${provider}] Open this URL to authenticate:`);
					console.error(url);
					if (instructions) console.error(instructions);
				},
				(message) => {
					console.error(`[oauth:${provider}] ${message}`);
				},
				async () => {
					return await promptOnce("Paste the full redirect URL (or press Enter to wait for browser callback): ");
				},
			);

		case "google-gemini-cli":
			return await loginGeminiCli(
				({ url, instructions }) => {
					console.error(`[oauth:${provider}] Open this URL to authenticate:`);
					console.error(url);
					if (instructions) console.error(instructions);
				},
				(message) => {
					console.error(`[oauth:${provider}] ${message}`);
				},
				async () => {
					return await promptOnce("Paste the full redirect URL (or press Enter to wait for browser callback): ");
				},
			);

		default:
			throw new Error(
				`OAuth login flow not implemented in examples for provider: ${provider}. ` +
					`(Supported here: openai-codex, google-antigravity, google-gemini-cli)`,
			);
	}
}

/**
 * Ensure we have valid OAuth credentials for a provider and return an API key string
 * suitable for passing to pie.
 *
 * - Refreshes tokens automatically.
 * - Persists updated credentials back into ~/.pi/agent/auth.json.
 * - If credentials are missing, starts an interactive login flow.
 */
export async function ensureOAuthApiKey(provider: OAuthProvider): Promise<string> {
	const auth = loadAuth();

	let authResult = await getOAuthApiKey(provider, auth as unknown as Record<string, OAuthCredentials>);

	if (!authResult) {
		console.error(`[oauth:${provider}] No credentials found in ${AUTH_PATH}. Starting login...`);
		const creds = await login(provider);
		auth[provider] = { type: "oauth", ...creds };
		saveAuth(auth);

		authResult = await getOAuthApiKey(provider, auth as unknown as Record<string, OAuthCredentials>);
		if (!authResult) {
			throw new Error(`OAuth login completed, but no credentials were returned for ${provider}`);
		}
	}

	auth[provider] = { type: "oauth", ...authResult.newCredentials };
	saveAuth(auth);

	return authResult.apiKey;
}
