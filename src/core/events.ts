import type { Api, AssistantMessage, Model, ToolCall } from "@mariozechner/pi-ai";
import type { Usage } from "./types.js";

export type ValidatorLayer = "schema" | "sync" | "async" | "command" | "http";

export type ExtractEvent<T> =
	// Lifecycle
	| StartEvent
	| CompleteEvent<T>
	| ErrorEvent
	// Warnings
	| WarningEvent
	// Cache
	| CacheHitEvent
	| CacheMissEvent
	| CacheSetEvent
	// Turn lifecycle
	| TurnStartEvent
	| TurnEndEvent
	// LLM
	| LlmStartEvent
	| LlmSelectedEvent
	| LlmDeltaEvent
	| LlmEndEvent
	// Extraction
	| ThinkingEvent
	| ToolCallEvent
	| JsonExtractedEvent
	// Validation
	| ValidationStartEvent
	| ValidationPassEvent
	| ValidationErrorEvent;

export interface StartEvent {
	type: "start";
	maxTurns: number;
}

export interface CompleteEvent<T> {
	type: "complete";
	result: T;
	turns: number;
	usage: Usage;
}

export interface ErrorEvent {
	type: "error";
	error: Error;
	turns: number;
}

export interface WarningEvent {
	type: "warning";
	code: "thinking_unsupported";
	message: string;
}

export interface CacheHitEvent {
	type: "cache_hit";
	key: string;
	age: number;
}

export interface CacheMissEvent {
	type: "cache_miss";
	key: string;
}

export interface CacheSetEvent {
	type: "cache_set";
	key: string;
}

export interface TurnStartEvent {
	type: "turn_start";
	turn: number;
}

export interface TurnEndEvent {
	type: "turn_end";
	turn: number;
	hasResult: boolean;
}

export interface LlmStartEvent {
	type: "llm_start";
}

export interface LlmSelectedEvent {
	type: "llm_selected";
	model: Model<Api>;
}

export interface LlmDeltaEvent {
	type: "llm_delta";
	delta: string;
}

export interface LlmEndEvent {
	type: "llm_end";
	message: AssistantMessage;
	usage: Usage;
}

export interface ThinkingEvent {
	type: "thinking";
	text: string;
}

export interface ToolCallEvent {
	type: "tool_call";
	toolCall: ToolCall;
}

export interface JsonExtractedEvent {
	type: "json_extracted";
	source: "tool_call" | "text";
}

export interface ValidationStartEvent {
	type: "validation_start";
	layer: ValidatorLayer;
}

export interface ValidationPassEvent {
	type: "validation_pass";
	layer: ValidatorLayer;
}

export interface ValidationErrorEvent {
	type: "validation_error";
	layer: ValidatorLayer;
	error: string;
}
