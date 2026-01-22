import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import type { KnownProvider, Message, Model } from "@mariozechner/pi-ai";
import { parseArgs, renderHelp } from "./cli/args.js";
import { loadAttachments } from "./cli/attachments.js";
import type { CliConfig, CliConfigResult } from "./cli/config.js";
import { loadCliConfig } from "./cli/config.js";
import { loginWithOAuthProvider, resolveApiKeyForProvider } from "./cli/oauth.js";
import { createJsonStreamer } from "./cli/stream.js";
import { MaxTurnsError } from "./core/errors.js";
import type { ExtractEvent } from "./core/events.js";
import { normalizeToolSchema } from "./core/schema/normalize.js";
import type { ExtractionSetup } from "./core/setup.js";
import { loadExtractionSetupFromContent } from "./core/setup.js";
import type { ExtractOptions, ExtractResult } from "./core/types.js";
import { extract } from "./extract.js";
import { getModels, getProviders } from "./models.js";
import type { Recipe, RecipeWarning } from "./recipes/index.js";
import { loadRecipeSetup, loadRecipes } from "./recipes/index.js";

const MODEL_PROVIDER_PREFERENCE = ["anthropic", "openai", "google"] as const;

export interface CliDeps {
	extractFn?: typeof extract;
	stdin?: Readable;
	stdout?: Writable;
	stderr?: Writable;
}

class CliExitError extends Error {
	constructor(
		message: string,
		public readonly exitCode: number,
	) {
		super(message);
		this.name = "CliExitError";
	}
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? process.stdout;
	const stderr = deps.stderr ?? process.stderr;

	try {
		return await runCliInternal(argv, deps, stdout, stderr);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		if (err instanceof CliExitError) {
			writeLine(stderr, `Error: ${err.message}`);
			return err.exitCode;
		}
		writeLine(stderr, `Error: ${err.message}`);
		return mapExtractionExitCode(err);
	}
}

async function runCliInternal(argv: string[], deps: CliDeps, stdout: Writable, stderr: Writable): Promise<number> {
	const { args, errors } = parseArgs(argv);

	if (args.help) {
		stdout.write(renderHelp());
		return 0;
	}
	if (args.version) {
		stdout.write(`${getVersion()}\n`);
		return 0;
	}

	if (errors.length > 0) {
		throw new CliExitError(errors.join("\n"), 2);
	}

	if (args.login) {
		try {
			await loginWithOAuthProvider(args.login, stderr);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(message, 3);
		}
		writeLine(stderr, `OAuth login completed for ${args.login}.`);
		return 0;
	}

	if (args.prompt && args.promptFile) {
		throw new CliExitError("Specify either --prompt or --prompt-file, not both.", 2);
	}

	const useRecipe = Boolean(args.recipe);
	if (args.config && useRecipe) {
		throw new CliExitError("Specify either --config or --recipe, not both.", 2);
	}
	if (useRecipe && (args.prompt || args.promptFile)) {
		throw new CliExitError("Do not use --prompt or --prompt-file with --recipe.", 2);
	}
	if (!useRecipe && (args.recipeConfig || args.recipeVars)) {
		throw new CliExitError("--recipe-config and --recipe-vars require --recipe.", 2);
	}

	if (args.listRecipes) {
		const result = loadRecipes({ cwd: process.cwd() });
		logRecipeWarnings(result.warnings, stderr);
		const sorted = [...result.recipes].sort((left, right) => left.name.localeCompare(right.name));
		for (const recipe of sorted) {
			stdout.write(`${recipe.name}\t${recipe.description}\t${recipe.source}\n`);
		}
		return 0;
	}

	const promptInput = args.promptFile ? readTextFile(args.promptFile, "prompt") : args.prompt;
	const promptPath = args.promptFile ? resolve(args.promptFile) : undefined;
	const promptIsSetup = !args.config && !useRecipe && typeof promptInput === "string" && promptInput.startsWith("---");

	let setupFromPrompt: ExtractionSetup<unknown> | undefined;
	if (promptIsSetup) {
		const setupPath = promptPath ?? resolve(process.cwd(), "inline-prompt.md");
		try {
			setupFromPrompt = loadExtractionSetupFromContent(promptInput, setupPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(message, 2);
		}
	}

	if (!args.config && !useRecipe) {
		if (!args.schema && !setupFromPrompt) {
			throw new CliExitError("Missing required option: --schema", 2);
		}
		if (!args.jsonSchema && !promptInput) {
			throw new CliExitError("Missing required option: --prompt or --prompt-file", 2);
		}
	}

	const baseSchema = args.schema ? loadSchema(args.schema) : undefined;
	const basePrompt = setupFromPrompt ? undefined : promptInput;
	const modelOverride = args.model ? resolveModel(args.model) : undefined;
	const baseModel = setupFromPrompt || useRecipe ? modelOverride : (modelOverride ?? resolveDefaultModel());

	let recipe: Recipe | undefined;
	let recipeVars: Record<string, unknown> | undefined;
	if (useRecipe) {
		try {
			recipeVars = args.recipeVars ? parseRecipeVars(args.recipeVars) : undefined;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(message, 2);
		}
		const result = loadRecipes({ cwd: process.cwd() });
		logRecipeWarnings(result.warnings, stderr);
		recipe = result.recipes.find((entry) => entry.name === args.recipe);
		if (!recipe) {
			throw new CliExitError(`Recipe not found: ${args.recipe}`, 2);
		}
	}

	const attachments = (() => {
		try {
			return loadAttachments(args.attachments);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(`Failed to load attachments: ${message}`, 4);
		}
	})();

	const input = args.jsonSchema ? "" : await loadInput(args.input, deps.stdin ?? process.stdin);
	const inputText = [attachments.textPrefix, input].filter((part) => part.length > 0).join("\n\n");

	const baseOptions: Partial<ExtractOptions<unknown>> = {
		schema: baseSchema,
		prompt: basePrompt,
		model: baseModel,
		attachments: attachments.images,
		maxTurns: args.maxTurns,
		validateCommand: args.validateCommand,
		validateUrl: args.validateUrl,
	};

	const recipeOverrides: Partial<ExtractOptions<unknown>> = {
		...(baseSchema ? { schema: baseSchema } : {}),
		...(modelOverride ? { model: modelOverride } : {}),
		...(args.maxTurns ? { maxTurns: args.maxTurns } : {}),
		...(args.validateCommand ? { validateCommand: args.validateCommand } : {}),
		...(args.validateUrl ? { validateUrl: args.validateUrl } : {}),
	};

	let finalInput: string | Message[] = inputText;
	let outputPath = args.output;
	let quiet = Boolean(args.quiet);
	let verbose = Boolean(args.verbose);
	let streamOutput = Boolean(args.stream);
	let options: ExtractOptions<unknown>;

	if (useRecipe) {
		if (!recipe) {
			throw new CliExitError("Recipe not resolved.", 2);
		}

		let recipePath = args.recipeConfig ?? "setup.md";
		let resolvedRecipePath = resolve(recipe.baseDir, recipePath);
		let recipeUsesConfig = isConfigFile(resolvedRecipePath);

		if (!args.recipeConfig && !existsSync(resolvedRecipePath)) {
			const fallback = resolve(recipe.baseDir, "config.ts");
			if (existsSync(fallback)) {
				recipePath = "config.ts";
				resolvedRecipePath = fallback;
				recipeUsesConfig = true;
			}
		}

		if (recipeUsesConfig) {
			let configFn: CliConfig<unknown>;
			try {
				configFn = await loadCliConfig(resolvedRecipePath);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new CliExitError(message, 4);
			}

			let configResult: CliConfigResult<unknown>;
			try {
				configResult = await configFn({
					args,
					input,
					inputText,
					attachments,
					resolveModel,
					resolveApiKeyForProvider: async (provider) => await resolveApiKeyForProvider(provider, stderr),
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new CliExitError(`Config execution failed: ${message}`, 4);
			}

			if (!configResult || typeof configResult !== "object" || !("options" in configResult)) {
				throw new CliExitError("Config must return an object with an options field.", 2);
			}

			const result = configResult as { options: ExtractOptions<unknown> } & {
				input?: string | Message[];
				output?: string;
				stream?: boolean;
				verbose?: boolean;
				quiet?: boolean;
			};
			if (!result.options || typeof result.options !== "object") {
				throw new CliExitError("Config must return an options object.", 2);
			}
			options = {
				...result.options,
				...recipeOverrides,
				attachments: attachments.images,
			} as ExtractOptions<unknown>;
			finalInput = result.input ?? finalInput;
			outputPath = result.output ?? outputPath;
			quiet = result.quiet ?? quiet;
			verbose = result.verbose ?? verbose;
			streamOutput = result.stream ?? streamOutput;
		} else {
			let setup: ExtractionSetup<unknown>;
			try {
				setup = loadRecipeSetup(recipe, { setupFile: recipePath, vars: recipeVars });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new CliExitError(`Failed to load recipe setup: ${message}`, 4);
			}
			options = { ...setup.options, ...recipeOverrides, attachments: attachments.images };
		}
	} else if (args.config) {
		let configFn: CliConfig<unknown>;
		try {
			configFn = await loadCliConfig(args.config);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(message, 4);
		}

		let configResult: CliConfigResult<unknown>;
		try {
			configResult = await configFn({
				args,
				input,
				inputText,
				attachments,
				resolveModel,
				resolveApiKeyForProvider: async (provider) => await resolveApiKeyForProvider(provider, stderr),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(`Config execution failed: ${message}`, 4);
		}

		if (!configResult || typeof configResult !== "object" || !("options" in configResult)) {
			throw new CliExitError("Config must return an object with an options field.", 2);
		}

		const result = configResult as { options: ExtractOptions<unknown> } & {
			input?: string | Message[];
			output?: string;
			stream?: boolean;
			verbose?: boolean;
			quiet?: boolean;
		};
		if (!result.options || typeof result.options !== "object") {
			throw new CliExitError("Config must return an options object.", 2);
		}
		options = { ...baseOptions, ...result.options } as ExtractOptions<unknown>;
		finalInput = result.input ?? finalInput;
		outputPath = result.output ?? outputPath;
		quiet = result.quiet ?? quiet;
		verbose = result.verbose ?? verbose;
		streamOutput = result.stream ?? streamOutput;
	} else if (setupFromPrompt) {
		const setupOverrides: Partial<ExtractOptions<unknown>> = {
			...(baseSchema ? { schema: baseSchema } : {}),
			...(modelOverride ? { model: modelOverride } : {}),
			...(args.maxTurns ? { maxTurns: args.maxTurns } : {}),
			...(args.validateCommand ? { validateCommand: args.validateCommand } : {}),
			...(args.validateUrl ? { validateUrl: args.validateUrl } : {}),
		};

		options = {
			...setupFromPrompt.options,
			...setupOverrides,
			attachments: attachments.images,
		};
	} else {
		options = baseOptions as ExtractOptions<unknown>;
	}

	if (!options.schema) {
		throw new CliExitError(
			"Missing schema. Provide --schema, include schema in a setup, use --recipe with schema, or return schema from --config.",
			2,
		);
	}

	if (!options.model) {
		throw new CliExitError(
			"Missing model. Provide --model, include model in a setup, use --recipe with model, or return model from --config.",
			2,
		);
	}

	if (!args.jsonSchema && !options.prompt) {
		throw new CliExitError(
			"Missing prompt. Provide --prompt/--prompt-file, include prompt in a setup, use --recipe with prompt, or return prompt from --config.",
			2,
		);
	}

	if (args.jsonSchema) {
		const normalized = normalizeToolSchema(options.model, options.schema).schema;
		stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
		return 0;
	}

	if (!options.apiKey) {
		try {
			options.apiKey = await resolveApiKeyForProvider(options.model.provider, stderr);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(`Authentication failed: ${message}`, 3);
		}
	}

	const extractFn = deps.extractFn ?? extract;
	const stream = extractFn(finalInput, options);

	const effectiveQuiet = Boolean(quiet);
	const effectiveVerbose = Boolean(verbose) && !effectiveQuiet;
	const effectiveStreamOutput = Boolean(streamOutput) && !effectiveQuiet;

	const jsonStreamer = effectiveStreamOutput
		? createJsonStreamer((line) => {
				stderr.write(line);
			})
		: null;

	let finalResult: ExtractResult<unknown> | undefined;
	let extractionError: Error | undefined;

	for await (const event of stream) {
		if (effectiveStreamOutput) {
			if (event.type === "llm_delta") {
				jsonStreamer?.handleDelta(event.delta);
			}
			if (event.type === "tool_call") {
				jsonStreamer?.handleToolCall(event.toolCall.arguments);
			}
			if (event.type === "turn_start") {
				jsonStreamer?.reset();
			}
		}

		if (effectiveVerbose) {
			logVerbose(event, stderr);
		}

		if (event.type === "complete") {
			finalResult = { data: event.result, turns: event.turns, usage: event.usage };
		}
		if (event.type === "error") {
			extractionError = event.error;
		}
	}

	const result = finalResult ?? (await stream.result());
	if (extractionError || !result) {
		const err = extractionError ?? new Error("Extraction failed.");
		writeLine(stderr, `Error: ${err.message}`);
		return mapExtractionExitCode(err);
	}

	const json = `${JSON.stringify(result.data, null, 2)}\n`;
	if (outputPath) {
		try {
			writeFileSync(resolve(outputPath), json, "utf8");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CliExitError(`Failed to write output file: ${message}`, 4);
		}
		return 0;
	}

	stdout.write(json);
	return 0;
}

function loadSchema(schemaArg: string): ExtractOptions<unknown>["schema"] {
	const trimmed = schemaArg.trim();
	try {
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			return JSON.parse(trimmed) as ExtractOptions<unknown>["schema"];
		}

		const raw = readTextFile(trimmed, "schema");
		return JSON.parse(raw) as ExtractOptions<unknown>["schema"];
	} catch (error) {
		if (error instanceof CliExitError) {
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new CliExitError(`Invalid schema: ${message}`, 2);
	}
}

function readTextFile(path: string, label: string): string {
	try {
		return readFileSync(resolve(path), "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliExitError(`Failed to read ${label} file: ${message}`, 4);
	}
}

function parseRecipeVars(value: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliExitError(`Invalid recipe vars JSON: ${message}`, 2);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new CliExitError("Recipe vars must be a JSON object.", 2);
	}
	return parsed as Record<string, unknown>;
}

function logRecipeWarnings(warnings: RecipeWarning[], stderr: Writable): void {
	for (const warning of warnings) {
		writeLine(stderr, `[recipe] ${warning.recipePath}: ${warning.message}`);
	}
}

function isConfigFile(path: string): boolean {
	return path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs");
}

async function loadInput(inputPath: string | undefined, stdin: Readable): Promise<string> {
	if (inputPath) {
		return readTextFile(inputPath, "input");
	}

	const isTty = typeof (stdin as { isTTY?: boolean }).isTTY === "boolean" && (stdin as { isTTY?: boolean }).isTTY;
	if (isTty) {
		return "";
	}

	try {
		return await readStream(stdin);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliExitError(`Failed to read stdin: ${message}`, 4);
	}
}

function resolveModel(value: string): Model<any> {
	if (value.includes("/")) {
		const [provider, pattern] = value.split("/");
		if (!provider || !pattern) {
			throw new CliExitError(`Invalid model spec: ${value}`, 2);
		}
		if (!isKnownProvider(provider)) {
			throw new CliExitError(`Unknown provider: ${provider}`, 2);
		}
		const matches = findModelMatches(getModels(provider), pattern);
		if (matches.length === 0) {
			throw new CliExitError(`Model not found: ${value}`, 2);
		}
		return pickBestModelMatch(matches);
	}

	const allModels = getProviders().flatMap((provider) => getModels(provider));
	const matches = findModelMatches(allModels, value);
	if (matches.length === 0) {
		throw new CliExitError(`Unknown model: ${value}`, 2);
	}
	return pickBestModelMatch(matches);
}

function resolveDefaultModel(): Model<any> {
	const providers = getProviders();
	const preferredProviders = MODEL_PROVIDER_PREFERENCE.filter((provider) =>
		providers.includes(provider as KnownProvider),
	);
	const orderedProviders = [
		...preferredProviders,
		...providers.filter(
			(provider) => !preferredProviders.includes(provider as (typeof MODEL_PROVIDER_PREFERENCE)[number]),
		),
	];

	for (const provider of orderedProviders) {
		const models = getModels(provider as KnownProvider);
		if (models.length === 0) {
			continue;
		}
		return pickBestModelMatch(models);
	}

	throw new CliExitError("No models available. Configure a provider API key or select a model explicitly.", 3);
}

function isAliasModelId(id: string): boolean {
	if (id.endsWith("-latest")) {
		return true;
	}

	return !/-\d{8}$/.test(id);
}

function findModelMatches(models: Model<any>[], pattern: string): Model<any>[] {
	const normalized = pattern.toLowerCase();

	const exactMatches = models.filter((model) => model.id.toLowerCase() === normalized);
	if (exactMatches.length > 0) {
		return exactMatches;
	}

	const prefixMatches = models.filter((model) => model.id.toLowerCase().startsWith(normalized));
	if (prefixMatches.length > 0) {
		return prefixMatches;
	}

	return models.filter((model) => {
		const id = model.id.toLowerCase();
		const name = model.name?.toLowerCase() ?? "";
		return id.includes(normalized) || name.includes(normalized);
	});
}

function pickBestModelMatch(matches: Model<any>[]): Model<any> {
	const sorted = [...matches].sort((left, right) => {
		const providerRank = providerPreferenceRank(left.provider) - providerPreferenceRank(right.provider);
		if (providerRank !== 0) {
			return providerRank;
		}

		const aliasRank = (isAliasModelId(left.id) ? 0 : 1) - (isAliasModelId(right.id) ? 0 : 1);
		if (aliasRank !== 0) {
			return aliasRank;
		}

		return right.id.localeCompare(left.id);
	});

	return sorted[0];
}

function providerPreferenceRank(provider: string): number {
	const index = MODEL_PROVIDER_PREFERENCE.indexOf(provider as (typeof MODEL_PROVIDER_PREFERENCE)[number]);
	return index === -1 ? MODEL_PROVIDER_PREFERENCE.length : index;
}

function isKnownProvider(value: string): value is KnownProvider {
	return getProviders().includes(value as KnownProvider);
}

function logVerbose(event: ExtractEvent<unknown>, stderr: Writable): void {
	switch (event.type) {
		case "start":
			writeLine(stderr, `[start] Max turns: ${event.maxTurns}`);
			break;
		case "turn_start":
			writeLine(stderr, `[turn] Starting turn ${event.turn}`);
			break;
		case "llm_start":
			writeLine(stderr, "[llm] Calling model");
			break;
		case "llm_selected":
			writeLine(stderr, `[llm] Selected ${event.model.provider}:${event.model.id}`);
			break;
		case "llm_end":
			writeLine(stderr, `[llm] Response received`);
			break;
		case "validation_start":
			writeLine(stderr, `[validate] Running: ${event.layer}`);
			break;
		case "validation_pass":
			writeLine(stderr, `[validate] Passed: ${event.layer}`);
			break;
		case "validation_error":
			writeLine(stderr, `[validate] Failed: ${event.layer} - ${event.error}`);
			break;
		case "warning":
			writeLine(stderr, `[warning] ${event.message}`);
			break;
		case "complete":
			writeLine(stderr, `[complete] Success after ${event.turns} turn(s)`);
			break;
		case "error":
			writeLine(stderr, `[error] ${event.error.message}`);
			break;
		default:
			break;
	}
}

function mapExtractionExitCode(error: Error): number {
	if (error instanceof MaxTurnsError) {
		return 1;
	}

	return 3;
}

function writeLine(stream: Writable, message: string): void {
	stream.write(`${message}\n`);
}

function getVersion(): string {
	const pkgPath = new URL("../package.json", import.meta.url);
	const raw = readFileSync(pkgPath, "utf8");
	const pkg = JSON.parse(raw) as { version?: string };
	return pkg.version ?? "0.0.0";
}

async function readStream(stream: Readable): Promise<string> {
	return await new Promise((resolveStream, reject) => {
		let data = "";
		stream.setEncoding("utf8");
		stream.on("data", (chunk) => {
			data += chunk;
		});
		stream.on("error", (error) => reject(error));
		stream.on("end", () => resolveStream(data));
	});
}
