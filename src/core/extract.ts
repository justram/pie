import type {
	Api,
	AssistantMessage,
	Context,
	Message,
	Model,
	ThinkingLevel as PiAiThinkingLevel,
	Tool,
	ToolCall,
	ToolResultMessage,
	UserMessage,
} from "@mariozechner/pi-ai";
import { EventStream, isContextOverflow, validateToolArguments } from "@mariozechner/pi-ai";
import { buildMessages, findToolCall, getTextContent, parseJsonFromText } from "../utils/helpers.js";
import { computeCacheKey } from "./cache/key.js";
import { createMemoryCache } from "./cache/memory.js";
import type { CacheOptions, CacheStore } from "./cache/types.js";
import { AbortError, ExtractError, MaxTurnsError } from "./errors.js";
import type { ExtractEvent } from "./events.js";
import { normalizeToolSchema } from "./schema/normalize.js";
import type { ExtractOptions, ExtractResult, ExtractStream, ThinkingBudgets, Usage } from "./types.js";
import { createValidationEmitter, runValidators } from "./validators/index.js";

const RESPOND_TOOL_NAME = "respond";
const RESPOND_TOOL_DESCRIPTION = "Return structured data that matches the schema.";
const DEFAULT_MAX_TOKENS = 32000;
const DEFAULT_CACHE = createMemoryCache();

export function extract<T>(input: string | Message[], options: ExtractOptions<T>): ExtractStream<T> {
	const maxTurns = options.maxTurns ?? 3;
	const stream = new EventStream<ExtractEvent<T>, ExtractResult<T> | undefined>(
		(event) => event.type === "complete" || event.type === "error",
		(event) =>
			event.type === "complete" ? { data: event.result, turns: event.turns, usage: event.usage } : undefined,
	);

	const abortController = createAbortController(options.signal);

	void runExtraction(input, options, maxTurns, stream, abortController.signal).catch(() => {
		// Error event already emitted in runExtraction.
	});

	return Object.assign(stream, {
		abort: () => abortController.abort(new AbortError()),
	});
}

export async function extractSync<T>(input: string | Message[], options: ExtractOptions<T>): Promise<T> {
	const maxTurns = options.maxTurns ?? 3;
	const result = await runExtraction(input, options, maxTurns, null, options.signal);
	return result.data;
}

async function runExtraction<T>(
	input: string | Message[],
	options: ExtractOptions<T>,
	maxTurns: number,
	eventStream: EventStream<ExtractEvent<T>, ExtractResult<T> | undefined> | null,
	signal?: AbortSignal,
): Promise<ExtractResult<T>> {
	eventStream?.push({ type: "start", maxTurns });

	const model = options.model;
	if (!model) {
		const error = new ExtractError('Missing required option "model".');
		eventStream?.push({ type: "error", error, turns: 0 });
		throw error;
	}

	if (signal?.aborted) {
		const error = toAbortError(signal.reason);
		eventStream?.push({ type: "error", error, turns: 0 });
		throw error;
	}

	// Warn if thinking is requested but model doesn't support it
	const thinkingRequested = options.thinking && options.thinking !== "off";
	if (thinkingRequested && !model.reasoning) {
		eventStream?.push({
			type: "warning",
			code: "thinking_unsupported",
			message: `Model "${model.provider}:${model.id}" does not support extended thinking. The 'thinking' option will be ignored.`,
		});
	}

	const { cacheKey, cacheStore, cacheTtl, cacheRevalidate } = resolveCache(input, options);
	if (cacheKey && cacheStore) {
		const entry = await cacheStore.get<T>(cacheKey);
		if (entry) {
			const age = Date.now() - entry.timestamp;
			const expired = cacheTtl !== undefined && age > cacheTtl;
			if (!expired) {
				if (cacheRevalidate) {
					const emitter = createValidationEmitter((e) => eventStream?.push(e));
					try {
						await runValidators(entry.data, options, emitter, signal);
						eventStream?.push({ type: "cache_hit", key: cacheKey, age });
						eventStream?.push({ type: "complete", result: entry.data, turns: entry.turns, usage: entry.usage });
						return { data: entry.data, turns: entry.turns, usage: entry.usage };
					} catch {
						await cacheStore.delete(cacheKey);
					}
				} else {
					eventStream?.push({ type: "cache_hit", key: cacheKey, age });
					eventStream?.push({ type: "complete", result: entry.data, turns: entry.turns, usage: entry.usage });
					return { data: entry.data, turns: entry.turns, usage: entry.usage };
				}
			}
		}

		eventStream?.push({ type: "cache_miss", key: cacheKey });
	}

	const messages = buildMessages(input, options.attachments);
	const { schema: toolSchema, unwrapKey } = normalizeToolSchema(model, options.schema);
	const tool: Tool = {
		name: RESPOND_TOOL_NAME,
		description: RESPOND_TOOL_DESCRIPTION,
		parameters: toolSchema,
	};
	const validationTool: Tool = {
		name: RESPOND_TOOL_NAME,
		description: RESPOND_TOOL_DESCRIPTION,
		parameters: toolSchema,
	};

	const streamFn = options.streamFn;
	if (!streamFn) {
		const error = new ExtractError('Missing required option "streamFn".');
		eventStream?.push({ type: "error", error, turns: 0 });
		throw error;
	}
	const maxTokens = Math.min(model.maxTokens, DEFAULT_MAX_TOKENS);
	const totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
	let lastError: Error | undefined;

	for (let turn = 1; turn <= maxTurns; turn++) {
		if (signal?.aborted) {
			const error = toAbortError(signal.reason);
			eventStream?.push({ type: "error", error, turns: turn - 1 });
			throw error;
		}

		eventStream?.push({ type: "turn_start", turn });

		const context = {
			systemPrompt: [
				options.prompt,
				"When you are ready, call the 'respond' tool with your structured answer.",
				"Do not include extra commentary in the tool call arguments.",
			].join("\n\n"),
			messages,
			tools: [tool],
		};

		eventStream?.push({ type: "llm_start" });

		let assistant: AssistantMessage;
		try {
			// Convert "off" or undefined to undefined (disabled), otherwise pass through
			const reasoning = options.thinking && options.thinking !== "off" ? options.thinking : undefined;
			assistant = await callLlm(
				streamFn,
				model,
				context,
				{
					apiKey: options.apiKey,
					signal,
					maxTokens,
					reasoning,
					thinkingBudgets: options.thinkingBudgets,
					onModelSelected: (selected) => eventStream?.push({ type: "llm_selected", model: selected }),
				},
				eventStream,
			);
		} catch (error) {
			const err = toError(error);
			eventStream?.push({ type: "error", error: err, turns: turn });
			throw err;
		}

		const turnUsage = mapUsage(assistant.usage);
		accumulateUsage(totalUsage, turnUsage);
		eventStream?.push({ type: "llm_end", message: assistant, usage: turnUsage });

		const toolCall = findToolCall(assistant, RESPOND_TOOL_NAME);
		if (toolCall) {
			eventStream?.push({ type: "tool_call", toolCall });
			eventStream?.push({ type: "json_extracted", source: "tool_call" });
		}

		let args: unknown | null = toolCall?.arguments;
		let jsonSource: "tool_call" | "text" | null = toolCall ? "tool_call" : null;
		if (!toolCall) {
			args = parseJsonFromText(assistant);
			if (args !== null) {
				jsonSource = "text";
				eventStream?.push({ type: "json_extracted", source: "text" });
			}
		}

		if (args === null) {
			eventStream?.push({ type: "thinking", text: getTextContent(assistant) });
			messages.push(assistant);
			messages.push(createContinueMessage());
			eventStream?.push({ type: "turn_end", turn, hasResult: false });
			continue;
		}

		const emitter = createValidationEmitter((e) => eventStream?.push(e));

		let data: T;
		try {
			emitter.start("schema");
			const normalizedArgs = normalizeToolArguments(args, unwrapKey);
			const validationToolCall: ToolCall = {
				type: "toolCall",
				id: toolCall?.id ?? "respond_fallback",
				name: RESPOND_TOOL_NAME,
				arguments: normalizedArgs as Record<string, unknown>,
			};
			const validated = validateToolArguments(validationTool, validationToolCall);
			data = unwrapToolArguments(validated, unwrapKey);
			emitter.pass("schema");
		} catch (error) {
			const err = toError(error);
			lastError = err;
			emitter.fail("schema", err.message);

			messages.push(assistant);
			if (jsonSource === "tool_call") {
				messages.push(createSchemaToolResult(toolCall?.id ?? "respond_fallback", err));
			} else {
				messages.push(createSchemaFeedbackMessage(err));
			}

			eventStream?.push({ type: "turn_end", turn, hasResult: false });
			continue;
		}

		try {
			await runValidators(data, options, emitter, signal);

			eventStream?.push({ type: "turn_end", turn, hasResult: true });

			const result: ExtractResult<T> = {
				data,
				turns: turn,
				usage: { ...totalUsage },
			};

			if (cacheKey && cacheStore) {
				try {
					await cacheStore.set(cacheKey, { data, timestamp: Date.now(), turns: turn, usage: { ...totalUsage } });
					eventStream?.push({ type: "cache_set", key: cacheKey });
				} catch {
					// Cache write failure shouldn't fail extraction.
				}
			}
			eventStream?.push({ type: "complete", result: data, turns: turn, usage: { ...totalUsage } });
			return result;
		} catch (error) {
			const err = toError(error);
			lastError = err;
			messages.push(assistant);
			if (jsonSource === "tool_call") {
				messages.push(createSchemaToolResult(toolCall?.id ?? "respond_fallback", err));
			} else {
				messages.push(createSchemaFeedbackMessage(err));
			}

			eventStream?.push({ type: "turn_end", turn, hasResult: false });
		}
	}

	const err = new MaxTurnsError(`Extraction failed after ${maxTurns} turns`, maxTurns, lastError);
	eventStream?.push({ type: "error", error: err, turns: maxTurns });
	throw err;
}

function resolveCache<T>(
	input: string | Message[],
	options: ExtractOptions<T>,
): { cacheKey: string | null; cacheStore: CacheStore | null; cacheTtl?: number; cacheRevalidate: boolean } {
	const raw = options.cache;
	if (!raw) {
		return { cacheKey: null, cacheStore: null, cacheRevalidate: false };
	}

	const cacheOptions: CacheOptions = typeof raw === "boolean" ? {} : raw;
	const store = cacheOptions.store ?? DEFAULT_CACHE;
	const revalidate = cacheOptions.revalidate ?? false;

	// If caller provides function validators, we only allow caching when revalidate is enabled.
	if ((options.validate || options.validateAsync) && !revalidate) {
		return { cacheKey: null, cacheStore: null, cacheRevalidate: false };
	}

	const inputText = typeof input === "string" ? input : JSON.stringify(input);
	const key = cacheOptions.key
		? cacheOptions.key(inputText, options as ExtractOptions<unknown>)
		: computeCacheKey(inputText, options as ExtractOptions<unknown>);
	return { cacheKey: key, cacheStore: store, cacheTtl: cacheOptions.ttl, cacheRevalidate: revalidate };
}

async function callLlm<T>(
	streamFn: ExtractOptions<unknown>["streamFn"],
	model: Model<Api>,
	context: Context,
	options: {
		apiKey?: string;
		signal?: AbortSignal;
		maxTokens: number;
		reasoning?: PiAiThinkingLevel;
		thinkingBudgets?: ThinkingBudgets;
		onModelSelected?: (model: Model<Api>) => void;
	},
	eventStream: EventStream<ExtractEvent<T>, ExtractResult<T> | undefined> | null,
): Promise<AssistantMessage> {
	if (!streamFn) {
		throw new Error("streamFn is required");
	}
	const s = streamFn(model, context, options);

	let message: AssistantMessage | null = null;
	for await (const event of s) {
		if (event.type === "text_delta") {
			eventStream?.push({ type: "llm_delta", delta: event.delta });
		}
		if (event.type === "thinking_delta") {
			eventStream?.push({ type: "thinking", text: event.delta });
		}
		if (event.type === "done") {
			message = event.message;
		}
		if (event.type === "error") {
			throw createLlmError(event.error, model);
		}
	}

	return message ?? (await s.result());
}

function mapUsage(usage: AssistantMessage["usage"]): Usage {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		totalTokens: usage.totalTokens,
		cost: usage.cost.total,
	};
}

function createLlmError(error: AssistantMessage, model: Model<Api>): ExtractError {
	const provider = error.provider ?? model.provider;
	const modelId = error.model ?? model.id;
	const api = error.api ?? model.api;
	const stopReason = error.stopReason ?? "error";
	const details = error.errorMessage?.trim();
	const contentDetails = getTextContent(error);
	const genericErrorPatterns = [/unknown error occurred/i, /unkown error ocurred/i, /^llm error$/i];
	const isGeneric = details ? genericErrorPatterns.some((pattern) => pattern.test(details)) : false;
	const hint = isGeneric
		? " Provider returned a generic error; this often means the model is not enabled for your account, the API key lacks access, or quota was exceeded. If this model works in another client, verify you are using the same provider and credentials."
		: "";
	const isOverflow = isContextOverflow(error, model.contextWindow);
	const overflowHint = isOverflow
		? ` Input exceeds the model context window (${model.contextWindow} tokens). Reduce input length or attachments.`
		: "";
	const metadata = [
		`provider=${provider}`,
		`model=${modelId}`,
		`api=${api}`,
		`stopReason=${stopReason}`,
		model.baseUrl ? `baseUrl=${model.baseUrl}` : null,
	]
		.filter((value): value is string => Boolean(value))
		.join(", ");
	const message = details
		? `LLM request failed (${metadata}). Provider message: ${details}.${hint}${overflowHint}`
		: `LLM request failed (${metadata}).${hint}${overflowHint}`;
	const contentSuffix = contentDetails && contentDetails !== details ? ` Provider content: ${contentDetails}` : "";

	return new ExtractError(`${message}${contentSuffix}`);
}

function accumulateUsage(target: Usage, extra: Usage): void {
	target.inputTokens += extra.inputTokens;
	target.outputTokens += extra.outputTokens;
	target.totalTokens += extra.totalTokens;
	target.cost += extra.cost;
}

function normalizeToolArguments(args: unknown, unwrapKey: string | null): unknown {
	if (!unwrapKey) {
		return args;
	}

	if (args && typeof args === "object" && !Array.isArray(args) && unwrapKey in (args as Record<string, unknown>)) {
		return args;
	}

	return { [unwrapKey]: args };
}

function unwrapToolArguments<T>(data: unknown, unwrapKey: string | null): T {
	if (!unwrapKey) {
		return data as T;
	}

	if (!data || typeof data !== "object" || !(unwrapKey in (data as Record<string, unknown>))) {
		throw new Error(`Validation failed for tool "${RESPOND_TOOL_NAME}": missing "${unwrapKey}" field.`);
	}

	return (data as Record<string, unknown>)[unwrapKey] as T;
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : "Unknown error");
}

function toAbortError(reason: unknown): AbortError {
	if (reason instanceof AbortError) {
		return reason;
	}
	if (reason instanceof Error) {
		return new AbortError(reason.message);
	}
	return new AbortError(typeof reason === "string" ? reason : "Extraction aborted");
}

function createContinueMessage(): UserMessage {
	return {
		role: "user",
		content: "Continue. Call the 'respond' tool when ready with your structured response.",
		timestamp: Date.now(),
	};
}

function createSchemaToolResult(toolCallId: string, error: Error): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName: RESPOND_TOOL_NAME,
		content: [{ type: "text", text: `Validation error: ${error.message}` }],
		isError: true,
		timestamp: Date.now(),
	};
}

function createSchemaFeedbackMessage(error: Error): UserMessage {
	return {
		role: "user",
		content: [
			"Validation error in your previous JSON output:",
			error.message,
			"",
			"Continue. Call the 'respond' tool when ready with your corrected structured response.",
		].join("\n"),
		timestamp: Date.now(),
	};
}

function createAbortController(signal?: AbortSignal): AbortController {
	const controller = new AbortController();

	if (!signal) {
		return controller;
	}

	if (signal.aborted) {
		controller.abort(signal.reason);
		return controller;
	}

	signal.addEventListener(
		"abort",
		() => {
			controller.abort(signal.reason);
		},
		{ once: true },
	);

	return controller;
}
