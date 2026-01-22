// Example: extraction setup generation with schema + prompt template
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/extraction-setup/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/extraction-setup/run.ts openai-codex gpt-5.2
//   npx tsx examples/extraction-setup/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/extraction-setup/run.ts anthropic claude-sonnet-4

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractSync, getModels, loadExtractionSetup, type Model, type Static, Type } from "@justram/pie";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity" | "anthropic";

const schema = Type.Object({
	summary: Type.String(),
	sentiment: Type.String({ enum: ["positive", "neutral", "negative"] }),
	issues: Type.Array(
		Type.Object({
			area: Type.String(),
			detail: Type.String(),
			severity: Type.String({ enum: ["low", "medium", "high"] }),
		}),
	),
	actionItems: Type.Array(
		Type.Object({
			owner: Type.String(),
			task: Type.String(),
			dueDate: Type.Optional(Type.String()),
		}),
	),
	quotes: Type.Optional(Type.Array(Type.String())),
});

type ExtractionResult = Static<typeof schema>;

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
	const provider = (providerArg as SupportedProvider | undefined) ?? "openai-codex";

	const defaultModelId =
		provider === "openai-codex"
			? "gpt-5.2"
			: provider === "google-antigravity"
				? "gemini-3-flash"
				: "claude-sonnet-4";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}/${modelId}`);
	}

	const apiKey =
		provider === "openai-codex" || provider === "google-antigravity" ? await ensureOAuthApiKey(provider) : undefined;

	console.error(`Using model: ${provider}:${modelId}`);

	const currentDir = dirname(fileURLToPath(import.meta.url));
	const schemaPath = join(currentDir, "setup-schema.json");
	const setupPath = join(currentDir, "setup.md");

	writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
	writeFileSync(
		setupPath,
		[
			"---",
			"schema: setup-schema.json",
			`model: ${provider}/${modelId}`,
			"template: true",
			'vars: \'{"task_name":"support triage","domain":"customer support tickets","required_fields":["summary","sentiment","issues","action items"],"include_quotes":true,"issue_areas":["authentication","performance","billing","usability"]}\'',
			"---",
			"You are performing {{ task_name }} for {{ domain }}.",
			"",
			"Output must include:",
			"{% for field in required_fields %}",
			"- {{ field }}",
			"{% endfor %}",
			"",
			"Prioritize issues in these areas:",
			"{% for area in issue_areas %}",
			"- {{ area }}",
			"{% endfor %}",
			"",
			"{% if include_quotes %}",
			"Include up to {{ max_quotes }} short quotes supporting the issues.",
			"{% endif %}",
		].join("\n"),
	);

	const setup = loadExtractionSetup(setupPath, {
		vars: {
			max_quotes: 2,
		},
		overrides: {
			apiKey,
		},
	});

	console.error("Starting extraction...");
	const result: ExtractionResult = await extractSync(input, setup.options);
	console.error("Extraction complete.");
	console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
