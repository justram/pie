// Example: template-driven setup (support triage) in code
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/templated-support-triage/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/templated-support-triage/run.ts openai-codex gpt-5.2
//   npx tsx examples/templated-support-triage/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/templated-support-triage/run.ts anthropic claude-sonnet-4

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractSync, getModels, loadExtractionSetup, type Model } from "pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "anthropic";

type ExtractionResult = {
	summary: string;
	sentiment: "positive" | "neutral" | "negative";
	issues: Array<{ area: string; detail: string; severity: "low" | "medium" | "high" }>;
	actionItems: Array<{ owner: string; task: string; dueDate?: string }>;
	quotes?: string[];
};

const input = [
	"Ticket 1287:",
	"- Customer reports intermittent 500 errors after login.",
	"- Impact is high during peak hours; retries sometimes succeed.",
	"- Customer asked for an ETA and workaround.",
	"- Agent suggested clearing cache; no improvement.",
	"- Engineering suspects a load balancer timeout.",
	"- Follow-up scheduled with Alex by Friday.",
].join("\n");

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const setupPath = join(currentDir, "setup.md");

	const setup = loadExtractionSetup<ExtractionResult>(setupPath);

	let modelOverride: Model<any> | undefined;
	let providerOverride: SupportedProvider | undefined;
	if (providerArg && modelIdArg) {
		providerOverride = providerArg as SupportedProvider;
		modelOverride = getModels(providerOverride).find((candidate) => candidate.id === modelIdArg) as
			| Model<any>
			| undefined;
		if (!modelOverride) {
			throw new Error(`Unknown model: ${providerOverride}/${modelIdArg}`);
		}
	}

	const provider = providerOverride ?? (setup.options.model.provider as SupportedProvider);
	const apiKey =
		provider === "openai-codex" || provider === "google-antigravity" ? await ensureOAuthApiKey(provider) : undefined;

	const options = {
		...setup.options,
		...(modelOverride ? { model: modelOverride } : {}),
		...(apiKey ? { apiKey } : {}),
	};

	console.error(`Using model: ${options.model.provider}:${options.model.id}`);
	console.error("Starting extraction...");
	const result: ExtractionResult = await extractSync(input, options);
	console.error("Extraction complete.");
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
