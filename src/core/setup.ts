import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import type { TSchema } from "@sinclair/typebox";
import { Environment } from "minijinja-js";
import { getModels, getProviders } from "../models.js";

import type { CacheOptions } from "./cache/types.js";
import { ExtractError } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import type { ExtractOptions } from "./types.js";

export interface LoadExtractionSetupOptions<T> {
	vars?: Record<string, unknown>;
	overrides?: Partial<Omit<ExtractOptions<T>, "prompt" | "schema">>;
}

export interface ExtractionSetup<T> {
	path: string;
	prompt: string;
	frontmatter: Record<string, unknown>;
	options: ExtractOptions<T>;
}

export function loadExtractionSetup<T>(
	setupPath: string,
	options: LoadExtractionSetupOptions<T> = {},
): ExtractionSetup<T> {
	const resolvedPath = isAbsolute(setupPath) ? setupPath : resolve(process.cwd(), setupPath);
	const raw = readFileSync(resolvedPath, "utf8");
	return loadExtractionSetupFromContent(raw, resolvedPath, options);
}

export function loadExtractionSetupFromContent<T>(
	content: string,
	setupPath: string,
	options: LoadExtractionSetupOptions<T> = {},
): ExtractionSetup<T> {
	const resolvedPath = isAbsolute(setupPath) ? setupPath : resolve(process.cwd(), setupPath);
	const { frontmatter, body } = parseFrontmatter(content);
	const promptSource = resolvePrompt(frontmatter, body, resolvedPath);
	const schema = resolveSchema(frontmatter, resolvedPath);
	const frontmatterOptions = mapFrontmatterToOptions<T>(frontmatter, resolvedPath);
	const mergedOptions = { ...frontmatterOptions, ...options.overrides, schema, prompt: promptSource };
	const prompt = renderPromptIfNeeded(promptSource, frontmatter, options.vars, resolvedPath);
	const finalOptions = { ...mergedOptions, prompt };

	const model = finalOptions.model;
	if (!model) {
		throw new ExtractError(`Missing required "model" in setup file or overrides: ${resolvedPath}`);
	}

	const typedOptions: ExtractOptions<T> = { ...finalOptions, model };

	return {
		path: resolvedPath,
		prompt,
		frontmatter,
		options: typedOptions,
	};
}

function resolvePrompt(frontmatter: Record<string, unknown>, body: string, setupPath: string): string {
	const bodyPrompt = body.trim();
	if (bodyPrompt.length > 0) {
		return bodyPrompt;
	}

	const frontmatterPrompt = frontmatter.prompt;
	if (typeof frontmatterPrompt === "string" && frontmatterPrompt.trim().length > 0) {
		return frontmatterPrompt.trim();
	}

	throw new ExtractError(`Missing prompt content in setup file: ${setupPath}`);
}

function renderPromptIfNeeded(
	prompt: string,
	frontmatter: Record<string, unknown>,
	vars: Record<string, unknown> | undefined,
	setupPath: string,
): string {
	const templateEnabled = toBoolean(frontmatter.template);
	if (!templateEnabled) {
		return prompt;
	}

	const env = new Environment();
	const mergedVars = { ...resolveFrontmatterVars(frontmatter, setupPath), ...vars };

	try {
		return env.renderStr(prompt, mergedVars);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ExtractError(`Template rendering failed for ${setupPath}: ${message}`);
	}
}

function resolveSchema(frontmatter: Record<string, unknown>, setupPath: string): TSchema {
	const schemaValue = frontmatter.schema;
	if (typeof schemaValue !== "string") {
		throw new ExtractError(`Missing or invalid "schema" in setup file: ${setupPath}`);
	}

	const trimmed = schemaValue.trim();
	if (!trimmed) {
		throw new ExtractError(`Missing "schema" value in setup file: ${setupPath}`);
	}

	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed) as TSchema;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new ExtractError(`Invalid inline schema JSON in setup file ${setupPath}: ${message}`);
		}
	}

	const schemaPath = resolve(dirname(setupPath), trimmed);
	try {
		const raw = readFileSync(schemaPath, "utf8");
		return JSON.parse(raw) as TSchema;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ExtractError(`Failed to load schema from ${schemaPath}: ${message}`);
	}
}

function mapFrontmatterToOptions<T>(
	frontmatter: Record<string, unknown>,
	setupPath: string,
): Partial<Omit<ExtractOptions<T>, "prompt" | "schema">> {
	const modelSpec = frontmatter.model;
	const model = typeof modelSpec === "string" ? resolveModel(modelSpec, setupPath) : undefined;
	const apiKey = typeof frontmatter.apiKey === "string" ? frontmatter.apiKey : undefined;
	const maxTurns = toNumber(frontmatter.maxTurns);
	const validateCommand = typeof frontmatter.validateCommand === "string" ? frontmatter.validateCommand : undefined;
	const validateUrl = typeof frontmatter.validateUrl === "string" ? frontmatter.validateUrl : undefined;
	const cache = normalizeCache(frontmatter.cache);

	return {
		model,
		apiKey,
		maxTurns,
		validateCommand,
		validateUrl,
		cache,
	};
}

function resolveModel(modelSpec: string, setupPath: string): Model<any> {
	const [provider, modelId] = modelSpec.split("/");
	if (!provider || !modelId) {
		throw new ExtractError(`Invalid model "${modelSpec}" in setup file ${setupPath}. Use "provider/model-id".`);
	}

	const providers = getProviders();
	const providerId = providers.find((item) => item === provider);
	if (!providerId) {
		throw new ExtractError(`Unknown provider "${provider}" in setup file ${setupPath}.`);
	}

	const model = getModels(providerId).find((candidate) => candidate.id === modelId);
	if (!model) {
		throw new ExtractError(`Model "${modelSpec}" not found (from ${setupPath}).`);
	}

	return model;
}

function resolveFrontmatterVars(frontmatter: Record<string, unknown>, setupPath: string): Record<string, unknown> {
	const varsValue = frontmatter.vars;
	if (!varsValue) {
		return {};
	}

	if (typeof varsValue === "object" && !Array.isArray(varsValue)) {
		return varsValue as Record<string, unknown>;
	}

	if (typeof varsValue === "string") {
		const trimmed = varsValue.trim();
		if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					return parsed as Record<string, unknown>;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new ExtractError(`Invalid vars JSON in setup file ${setupPath}: ${message}`);
			}
		}
	}

	throw new ExtractError(`Frontmatter "vars" must be an object or JSON object string in ${setupPath}.`);
}

function normalizeCache(value: unknown): boolean | CacheOptions | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const bool = toBoolean(value);
		return typeof bool === "boolean" ? bool : undefined;
	}
	return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.trim().toLowerCase();
		if (lower === "true") return true;
		if (lower === "false") return false;
	}
	return undefined;
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
		return Number(value);
	}

	return undefined;
}
