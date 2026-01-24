import { getSupportedOAuthProviders, loginWithOAuthProvider, resolveApiKeyForProvider } from "@justram/pie";

const supported = getSupportedOAuthProviders();
const provider = process.argv[2] ?? "openai-codex";

if (!supported.includes(provider)) {
	throw new Error(`Unsupported provider: ${provider}. Supported: ${supported.join(", ")}`);
}

await loginWithOAuthProvider(provider, process.stderr);

const apiKey = await resolveApiKeyForProvider(provider, process.stderr);
if (!apiKey) {
	throw new Error(`Login completed but no API key resolved for ${provider}.`);
}

console.log(`OAuth login complete for ${provider}. Credentials saved to ~/.pi/agent/auth.json.`);
