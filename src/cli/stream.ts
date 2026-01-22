import { parseStreamingJson } from "@mariozechner/pi-ai";

export interface JsonStreamer {
	handleDelta(delta: string): void;
	handleToolCall(args: unknown): void;
	reset(): void;
}

export function createJsonStreamer(writeLine: (line: string) => void): JsonStreamer {
	let buffer = "";
	let lastSerialized: string | null = null;

	const emit = (value: unknown) => {
		const serialized = JSON.stringify(value);
		if (serialized === lastSerialized) {
			return;
		}
		lastSerialized = serialized;
		writeLine(`${JSON.stringify({ partial: value })}\n`);
	};

	return {
		handleDelta: (delta) => {
			buffer += delta;
			const parsed = parsePartialJson(buffer);
			if (parsed !== null) {
				emit(parsed);
			}
		},
		handleToolCall: (args) => {
			emit(args);
		},
		reset: () => {
			buffer = "";
			lastSerialized = null;
		},
	};
}

export function parsePartialJson(text: string): unknown | null {
	const start = findJsonStart(text);
	if (start === -1) {
		return null;
	}

	const slice = text.slice(start).trim();
	if (!slice) {
		return null;
	}

	const parsed = parseStreamingJson(slice);
	return shouldEmitParsed(parsed, slice) ? parsed : null;
}

function shouldEmitParsed(parsed: unknown, source: string): boolean {
	if (parsed === null || parsed === undefined) {
		return false;
	}

	const trimmed = source.trim();
	if (trimmed === "{}" || trimmed === "[]") {
		return true;
	}

	if (Array.isArray(parsed)) {
		if (parsed.length > 0) {
			return true;
		}
		return trimmed.endsWith("]");
	}

	if (typeof parsed === "object") {
		const keys = Object.keys(parsed as Record<string, unknown>);
		if (keys.length > 0) {
			return true;
		}
		return trimmed.endsWith("}");
	}

	return true;
}

function findJsonStart(text: string): number {
	const objStart = text.indexOf("{");
	const arrStart = text.indexOf("[");
	if (objStart === -1) return arrStart;
	if (arrStart === -1) return objStart;
	return Math.min(objStart, arrStart);
}
