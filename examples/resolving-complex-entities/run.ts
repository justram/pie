// Example: resolve complex entities with dependencies and emit Graphviz dot
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/resolving-complex-entities/run.ts
//
// Choose provider/model:
//   npx tsx examples/resolving-complex-entities/run.ts openai-codex gpt-5.2-codex
//   npx tsx examples/resolving-complex-entities/run.ts google-antigravity gemini-3-flash
//
// Render with Graphviz (requires `dot` in PATH):
//   npx tsx examples/resolving-complex-entities/run.ts --render entity.png
//   # output will be written next to this script
//
// Tip:
//   npx tsx examples/resolving-complex-entities/run.ts > entity.json
//   jq -r '.graphviz' entity.json > entity.dot
//   dot -Tpng entity.dot -o entity.png

import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtractOptions, extract, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

type CliArgs = {
	providerArg?: string;
	modelIdArg?: string;
	renderPath?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));

const PropertySchema = Type.Object({
	key: Type.String(),
	value: Type.String(),
	resolved_absolute_value: Type.String(),
});

const EntitySchema = Type.Object({
	id: Type.Number({
		description:
			"Unique identifier for the entity, used for deduplication, design a scheme allows multiple entities.",
	}),
	subquote_string: Type.Array(
		Type.String({
			description:
				"Correctly resolved value of the entity, if the entity is a reference to another entity, this should be the id of the referenced entity, include a few more words before and after the value to allow for some context to be used in the resolution",
		}),
	),
	entity_title: Type.String(),
	properties: Type.Array(PropertySchema, {
		description: "List of properties of the entity",
	}),
	dependencies: Type.Array(Type.Number(), {
		description: "List of entity ids that this entity depends  or relies on to resolve it",
	}),
});

const DocumentExtractionSchema = Type.Object({
	entities: Type.Array(EntitySchema, {
		description: "Body of the answer, each fact should be its seperate object with a body and a list of sources",
	}),
});

type Property = Static<typeof PropertySchema>;

type Entity = Static<typeof EntitySchema>;

type DocumentExtraction = Static<typeof DocumentExtractionSchema>;

const input = `
Sample Legal Contract
Agreement Contract

This Agreement is made and entered into on 2020-01-01 by and between Company A ("the Client") and Company B ("the Service Provider").

Article 1: Scope of Work

The Service Provider will deliver the software product to the Client 30 days after the agreement date.

Article 2: Payment Terms

The total payment for the service is $50,000.
An initial payment of $10,000 will be made within 7 days of the the signed date.
The final payment will be due 45 days after [SignDate].

Article 3: Confidentiality

The parties agree not to disclose any confidential information received from the other party for 3 months after the final payment date.

Article 4: Termination

The contract can be terminated with a 30-day notice, unless there are outstanding obligations that must be fulfilled after the [DeliveryDate].
`;

const prompt =
	"You are a perfect entity resolution system that extracts facts from the document. Extract and resolve a list of entities from the following document:";

function parseArgs(argv: string[]): CliArgs {
	const positional: string[] = [];
	let renderPath: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--render") {
			renderPath = argv[index + 1] ?? "entity.png";
			index += 1;
			continue;
		}
		if (arg.startsWith("--render=")) {
			renderPath = arg.slice("--render=".length) || "entity.png";
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		positional.push(arg);
	}

	const [providerArg, modelIdArg] = positional;
	return { providerArg, modelIdArg, renderPath };
}

function generateHtmlLabel(entity: Entity): string {
	const rows = entity.properties
		.map((prop: Property) => `<tr><td>${prop.key}</td><td>${prop.resolved_absolute_value}</td></tr>`)
		.join("");

	return `<<table border="0" cellborder="1" cellspacing="0">\n<tr><td colspan="2"><b>${entity.entity_title}</b></td></tr>\n${rows}\n</table>>`;
}

function generateGraphviz(data: DocumentExtraction): string {
	const lines = ["digraph EntityGraph {", "  node [shape=plaintext];"];
	const nodeLines = data.entities.map(
		(entity) => `  ${JSON.stringify(String(entity.id))} [label=${generateHtmlLabel(entity)}];`,
	);
	const edgeLines = data.entities.flatMap((entity) =>
		entity.dependencies.map((depId) => `  ${JSON.stringify(String(entity.id))} -> ${JSON.stringify(String(depId))};`),
	);
	return [...lines, ...nodeLines, ...edgeLines, "}"].join("\n");
}

function resolveRenderPath(renderPath: string): string {
	if (isAbsolute(renderPath)) {
		return renderPath;
	}

	return resolve(scriptDir, renderPath);
}

function renderGraphviz(graphviz: string, outputPath: string): void {
	const result = spawnSync("dot", ["-Tpng", "-o", outputPath], {
		input: graphviz,
		encoding: "utf-8",
	});

	if (result.error) {
		throw new Error(`Failed to run Graphviz 'dot': ${result.error.message}`);
	}

	if (result.status !== 0) {
		const stderr = result.stderr?.toString() ?? "";
		throw new Error(`Graphviz 'dot' failed${stderr ? `: ${stderr}` : "."}`);
	}
}

async function resolveWithProgress<T>(inputText: string, options: ExtractOptions<T>): Promise<T> {
	const stream = extract(inputText, options);
	let result: T | null = null;
	const dotThreshold = 120;
	let buffered = 0;
	let streamingLineOpen = false;

	const writeStreamingDot = (delta: string): void => {
		buffered += delta.length;
		if (buffered < dotThreshold) {
			return;
		}
		if (!streamingLineOpen) {
			process.stderr.write("Streaming response");
			streamingLineOpen = true;
		}
		process.stderr.write(".");
		buffered = 0;
	};

	const endStreamingLine = (): void => {
		if (streamingLineOpen) {
			process.stderr.write("\n");
			streamingLineOpen = false;
		}
		buffered = 0;
	};

	for await (const event of stream) {
		switch (event.type) {
			case "start":
				console.error(`Max turns: ${event.maxTurns}`);
				break;
			case "cache_hit":
				console.error(`Cache hit (age ${Math.round(event.age / 1000)}s).`);
				break;
			case "cache_miss":
				console.error("Cache miss.");
				break;
			case "cache_set":
				console.error("Cache set.");
				break;
			case "turn_start":
				console.error(`Turn ${event.turn} started.`);
				break;
			case "turn_end":
				if (!event.hasResult) {
					console.error(`Turn ${event.turn} ended without a valid result; retrying.`);
				}
				break;
			case "llm_start":
				console.error("Waiting for model response...");
				break;
			case "llm_selected":
				console.error(`Selected model: ${event.model.provider}:${event.model.id}`);
				break;
			case "llm_delta":
				writeStreamingDot(event.delta);
				break;
			case "thinking":
				writeStreamingDot(event.text);
				break;
			case "llm_end":
				endStreamingLine();
				console.error(
					`LLM response received (input ${event.usage.inputTokens}, output ${event.usage.outputTokens}).`,
				);
				break;
			case "validation_start":
				console.error(`Validation started: ${event.layer}.`);
				break;
			case "validation_pass":
				console.error(`Validation passed: ${event.layer}.`);
				break;
			case "validation_error":
				console.error(`Validation failed: ${event.layer}: ${event.error}`);
				break;
			case "warning":
				console.error(`Warning: ${event.message}`);
				break;
			case "complete":
				endStreamingLine();
				result = event.result;
				console.error(`Extraction complete in ${event.turns} turn(s).`);
				break;
			case "error":
				endStreamingLine();
				throw event.error;
			case "json_extracted":
			case "tool_call":
				break;
		}
	}

	if (!result) {
		throw new Error("Extraction failed without a result.");
	}

	return result;
}

async function main(): Promise<void> {
	const { providerArg, modelIdArg, renderPath } = parseArgs(process.argv.slice(2));
	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const defaultModelId = provider === "openai-codex" ? "gpt-5.2-codex" : "gemini-3-flash";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	const apiKey = await ensureOAuthApiKey(provider);

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Resolving entities...");

	const result: DocumentExtraction = await resolveWithProgress(input, {
		schema: DocumentExtractionSchema,
		prompt,
		model,
		apiKey,
	});

	const graphviz = generateGraphviz(result);

	const resolvedRenderPath = renderPath ? resolveRenderPath(renderPath) : undefined;

	if (resolvedRenderPath) {
		console.error(`Rendering Graphviz to ${resolvedRenderPath}...`);
		renderGraphviz(graphviz, resolvedRenderPath);
		console.error("Graphviz render complete.");
	}

	console.error("Entity resolution complete.");
	console.log(
		JSON.stringify(
			{
				entities: result.entities,
				graphviz,
				renderPath: resolvedRenderPath,
			},
			null,
			2,
		),
	);
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
