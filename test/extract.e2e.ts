import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getModel, getOAuthApiKey, type OAuthCredentials } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";

import { extractSync, Type } from "../src/index.js";

type AuthMap = Record<string, { type: "oauth" } & OAuthCredentials>;

type ProviderId = "openai-codex" | "google-antigravity";

const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const RUN_E2E = process.env.RUN_E2E === "1";
const describeIf = RUN_E2E ? describe : describe.skip;

const schema = Type.Object({
	sentiment: Type.String({ enum: ["positive", "negative", "neutral"] }),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
	keywords: Type.Array(Type.String()),
	meta: Type.Object({
		source: Type.String(),
		tags: Type.Array(Type.String()),
	}),
	items: Type.Array(
		Type.Object({
			name: Type.String(),
			score: Type.Number({ minimum: 0, maximum: 1 }),
		}),
	),
});

function loadAuth(): AuthMap {
	const raw = readFileSync(AUTH_PATH, "utf-8");
	return JSON.parse(raw) as AuthMap;
}

function saveAuth(auth: AuthMap): void {
	writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2), "utf-8");
}

async function resolveOAuth(provider: ProviderId, auth: AuthMap): Promise<{ apiKey: string; updated: AuthMap }> {
	const authResult = await getOAuthApiKey(provider, auth);
	if (!authResult) {
		throw new Error(`No OAuth credentials for ${provider} in ${AUTH_PATH}`);
	}
	auth[provider] = { type: "oauth", ...authResult.newCredentials };
	return { apiKey: authResult.apiKey, updated: auth };
}

describeIf("e2e extraction", () => {
	it(
		"openai-codex gpt-5.2-codex",
		async () => {
			let auth = loadAuth();
			const codexAuth = await resolveOAuth("openai-codex", auth);
			auth = codexAuth.updated;
			saveAuth(auth);

			const result = await extractSync("I love this product. It is fast and reliable.", {
				schema,
				prompt: "Classify sentiment and extract keywords.",
				model: getModel("openai-codex", "gpt-5.2-codex"),
				apiKey: codexAuth.apiKey,
			});

			expect(result).toHaveProperty("sentiment");
			expect(result).toHaveProperty("confidence");
			expect(result).toHaveProperty("keywords");
			expect(result).toHaveProperty("meta");
			expect(result).toHaveProperty("items");
		},
		120000,
	);

	it(
		"google-antigravity gemini-3-flash",
		async () => {
			let auth = loadAuth();
			const antigravityAuth = await resolveOAuth("google-antigravity", auth);
			auth = antigravityAuth.updated;
			saveAuth(auth);

			const result = await extractSync("I love this product. It is fast and reliable.", {
				schema,
				prompt: "Classify sentiment and extract keywords.",
				model: getModel("google-antigravity", "gemini-3-flash"),
				apiKey: antigravityAuth.apiKey,
			});

			expect(result).toHaveProperty("sentiment");
			expect(result).toHaveProperty("confidence");
			expect(result).toHaveProperty("keywords");
			expect(result).toHaveProperty("meta");
			expect(result).toHaveProperty("items");
		},
		120000,
	);
});
