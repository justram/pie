import { describe, expect, it } from "vitest";

import { buildMessages, findToolCall, getTextContent, parseJsonFromText } from "../src/utils/helpers.js";
import * as root from "../src/index.js";
import * as cliModule from "../src/cli/index.js";
import * as setupModule from "../src/setup.js";
import * as modelsModule from "../src/models.js";
import * as cacheModule from "../src/cache/index.js";

describe("helpers", () => {
	it("buildMessages preserves message arrays and builds user message for string input", () => {
		const existing = [{ role: "user", content: "x", timestamp: 1 }] as any;
		expect(buildMessages(existing)).toBe(existing);

		const built = buildMessages("hello", [{ type: "image", image: "abc" }] as any);
		expect(built).toHaveLength(1);
		expect((built[0] as any).role).toBe("user");
		expect(Array.isArray((built[0] as any).content)).toBe(true);
	});

	it("finds tool call, extracts text, and parses json from different formats", () => {
		const message = {
			role: "assistant",
			content: [
				{ type: "text", text: "prefix" },
				{ type: "toolCall", id: "1", name: "respond", arguments: { ok: true } },
				{ type: "text", text: "```json\n{\"answer\":42}\n```" },
			],
		} as any;

		expect(findToolCall(message, "respond")?.name).toBe("respond");
		expect(getTextContent(message)).toContain("prefix");
		expect(parseJsonFromText(message)).toEqual({ answer: 42 });
		expect(parseJsonFromText({ role: "assistant", content: [{ type: "text", text: "not json" }] } as any)).toBeNull();
	});
});

describe("public exports", () => {
	it("exposes primary SDK entrypoints", () => {
		expect(typeof root.extract).toBe("function");
		expect(typeof root.extractSync).toBe("function");
		expect(typeof root.getModel).toBe("function");
		expect(typeof root.loadExtractionSetup).toBe("function");
		expect(typeof root.createMemoryCache).toBe("function");
	});

	it("exposes cli/setup/model/cache modules", () => {
		expect(typeof cliModule.runCli).toBe("function");
		expect(typeof setupModule.loadExtractionSetup).toBe("function");
		expect(typeof modelsModule.getModels).toBe("function");
		expect(typeof cacheModule.warmCache).toBe("function");
	});
});
