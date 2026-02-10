import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import {
	getEnvApiKey,
	getOAuthApiKey,
	getOAuthProvider,
	getOAuthProviders,
} from "@mariozechner/pi-ai";
import lockfile from "proper-lockfile";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("proper-lockfile", () => ({
	default: { lock: vi.fn() },
}));

vi.mock("@mariozechner/pi-ai", () => ({
	getEnvApiKey: vi.fn(() => undefined),
	getOAuthApiKey: vi.fn(),
	getOAuthProvider: vi.fn(),
	getOAuthProviders: vi.fn(() => [{ id: "openai-codex" }]),
	loginAnthropic: vi.fn(),
	loginAntigravity: vi.fn(),
	loginGeminiCli: vi.fn(),
	loginGitHubCopilot: vi.fn(),
	loginOpenAICodex: vi.fn(),
}));

describe("resolveApiKeyForProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reads refreshed credentials from disk when lock acquisition fails", async () => {
		const originalHome = process.env.HOME;
		const home = join(tmpdir(), `pie-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		process.env.HOME = home;
		try {
			const authDir = join(home, ".pi", "agent");
			const authPath = join(authDir, "auth.json");
			mkdirSync(authDir, { recursive: true });

			const expiredAuth = {
				"openai-codex": {
					type: "oauth",
					accessToken: "expired-token",
					refreshToken: "refresh-token",
					expires: Date.now() - 1000,
				},
			};
			writeFileSync(authPath, JSON.stringify(expiredAuth), "utf-8");

			const refreshedAuth = {
				"openai-codex": {
					type: "oauth",
					accessToken: "fresh-token",
					refreshToken: "refresh-token",
					expires: Date.now() + 60_000,
				},
			};

			vi.mocked(getOAuthProviders).mockReturnValue([{ id: "openai-codex" }]);
			vi.mocked(getOAuthProvider).mockReturnValue({
				id: "openai-codex",
				getApiKey: (cred: { accessToken: string }) => `api-${cred.accessToken}`,
			});

			vi.mocked(lockfile.lock).mockImplementation(async () => {
				writeFileSync(authPath, JSON.stringify(refreshedAuth), "utf-8");
				throw new Error("lock failed");
			});

			vi.mocked(getEnvApiKey).mockReturnValue(undefined);
			vi.mocked(getOAuthApiKey).mockResolvedValue(null);

			const { resolveApiKeyForProvider } = await import("../src/auth.js");

			const stderr = new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			});

			const apiKey = await resolveApiKeyForProvider("openai-codex", stderr);
			expect(apiKey).toBe("api-fresh-token");
			expect(lockfile.lock).toHaveBeenCalledTimes(1);
			expect(getOAuthApiKey).not.toHaveBeenCalled();
		} finally {
			process.env.HOME = originalHome;
		}
	});
});
