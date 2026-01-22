import type {
	Api,
	AssistantMessageEventStream,
	Context,
	ImageContent,
	Model,
	ThinkingBudgets as PiAiThinkingBudgets,
	ThinkingLevel as PiAiThinkingLevel,
} from "@mariozechner/pi-ai";
import type { TSchema } from "@sinclair/typebox";
import type { CacheOptions } from "./cache/types.js";
import type { ExtractEvent } from "./events.js";

export type StreamFnOptions = {
	apiKey?: string;
	signal?: AbortSignal;
	maxTokens: number;
	reasoning?: PiAiThinkingLevel;
	thinkingBudgets?: ThinkingBudgets;
	onModelSelected?: (model: Model<Api>) => void;
};

export type StreamFn = (model: Model<Api>, context: Context, options: StreamFnOptions) => AssistantMessageEventStream;

/**
 * Thinking/reasoning level for models that support extended thinking.
 * - "off": Disable thinking (default)
 * - "minimal" to "xhigh": Increasing levels of thinking effort
 *
 * Note: "xhigh" is only supported by OpenAI gpt-5.1-codex-max, gpt-5.2, and gpt-5.2-codex models.
 */
export type ThinkingLevel = "off" | PiAiThinkingLevel;

/**
 * Custom token budgets for thinking levels (token-based providers only).
 */
export type ThinkingBudgets = PiAiThinkingBudgets;

/**
 * Options for extract() and extractSync()
 */
export interface ExtractOptions<T> {
	/**
	 * TypeBox schema defining the expected output structure.
	 * Converted to JSON Schema for the LLM and used by AJV for validation.
	 */
	schema: TSchema;

	/**
	 * System prompt instructing the LLM what to extract.
	 * Automatically appended with "You MUST call the 'respond' tool."
	 */
	prompt: string;

	/**
	 * LLM model to use. Get one via getModel("provider", "model-id").
	 */
	model: Model<Api>;

	/**
	 * API key for the model provider.
	 * @default Reads from environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
	 */
	apiKey?: string;

	/**
	 * Image attachments for vision-capable models.
	 * Images are sent alongside the text input for multimodal extraction.
	 */
	attachments?: ImageContent[];

	/**
	 * Synchronous validation function.
	 * Throw an error to fail validation.
	 */
	validate?: (data: T) => void;

	/**
	 * Asynchronous validation function.
	 * Can call external APIs. Throw/reject to fail validation.
	 */
	validateAsync?: (data: T) => Promise<void>;

	/**
	 * Shell command for validation.
	 * Receives JSON on stdin. Exit 0 = pass, non-zero = fail (stderr = error).
	 */
	validateCommand?: string;

	/**
	 * HTTP endpoint for validation.
	 * POST JSON body. 2xx = pass, 4xx/5xx = fail (body = error).
	 */
	validateUrl?: string;

	/**
	 * Maximum turns in the extraction loop. Each turn is one LLM call.
	 * @default 3
	 */
	maxTurns?: number;

	/**
	 * Override the LLM stream function (e.g. proxy/routing).
	 */
	streamFn?: StreamFn;

	/**
	 * Enable response caching.
	 * @default false
	 */
	cache?: boolean | CacheOptions;

	/**
	 * Abort signal for cancellation.
	 */
	signal?: AbortSignal;

	/**
	 * Thinking/reasoning level for models that support extended thinking.
	 * Controls how much "thinking effort" the model uses before responding.
	 * @default "off"
	 */
	thinking?: ThinkingLevel;

	/**
	 * Custom token budgets for thinking levels (token-based providers only).
	 * Override the default budgets for specific thinking levels.
	 */
	thinkingBudgets?: ThinkingBudgets;
}

/**
 * Result of a successful extraction.
 */
export interface ExtractResult<T> {
	/** The extracted data, validated against the schema */
	data: T;

	/** Number of turns taken (1 = first turn succeeded) */
	turns: number;

	/** Cumulative token usage across all turns */
	usage: Usage;
}

/**
 * Token usage and cost information.
 */
export interface Usage {
	/** Input tokens (prompt + context) */
	inputTokens: number;

	/** Output tokens (response) */
	outputTokens: number;

	/** Total tokens (input + output) */
	totalTokens: number;

	/** Estimated cost in USD */
	cost: number;
}

/**
 * Async iterable stream of extraction events.
 */
export interface ExtractStream<T> extends AsyncIterable<ExtractEvent<T>> {
	/**
	 * Get the final result.
	 * Resolves when extraction completes.
	 * Returns undefined if extraction failed.
	 */
	result(): Promise<ExtractResult<T> | undefined>;

	/**
	 * Abort the extraction.
	 * Causes the stream to emit an error event.
	 */
	abort(): void;
}
