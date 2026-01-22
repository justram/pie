import type { AssistantMessage, ImageContent, Message, ToolCall, UserMessage } from "@mariozechner/pi-ai";

export function buildMessages(input: string | Message[], attachments?: ImageContent[]): Message[] {
	if (typeof input !== "string") {
		return input;
	}

	const content = attachments?.length
		? ([{ type: "text", text: input }, ...attachments] as UserMessage["content"])
		: input;

	const message: UserMessage = {
		role: "user",
		content,
		timestamp: Date.now(),
	};

	return [message];
}

export function findToolCall(message: AssistantMessage, toolName: string): ToolCall | undefined {
	for (const content of message.content) {
		if (content.type === "toolCall" && content.name === toolName) {
			return content;
		}
	}

	return undefined;
}

export function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n")
		.trim();
}

export function parseJsonFromText(message: AssistantMessage): unknown | null {
	const text = getTextContent(message);
	if (!text) {
		return null;
	}

	const candidates = collectJsonCandidates(text);
	for (const candidate of candidates) {
		const parsed = tryParseJson(candidate);
		if (parsed !== null) {
			return parsed;
		}
	}

	return null;
}

function collectJsonCandidates(text: string): string[] {
	const candidates: string[] = [];
	const fenced = extractFencedJson(text);
	if (fenced) {
		candidates.push(fenced);
	}

	candidates.push(text);

	const objectCandidate = sliceBetween(text, "{", "}");
	if (objectCandidate) {
		candidates.push(objectCandidate);
	}

	const arrayCandidate = sliceBetween(text, "[", "]");
	if (arrayCandidate) {
		candidates.push(arrayCandidate);
	}

	return candidates;
}

function extractFencedJson(text: string): string | null {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	return match ? match[1].trim() : null;
}

function sliceBetween(text: string, open: string, close: string): string | null {
	const start = text.indexOf(open);
	const end = text.lastIndexOf(close);
	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	return text.slice(start, end + 1).trim();
}

function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
