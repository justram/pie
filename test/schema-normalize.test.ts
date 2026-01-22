import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { normalizeToolSchema } from "../src/core/schema/normalize.js";

describe("normalizeToolSchema", () => {
	it("normalizes literal unions for Google providers", () => {
		const schema = Type.Object({
			sentiment: Type.Union([Type.Literal("positive"), Type.Literal("negative"), Type.Literal("neutral")]),
		});

		const model = getModel("google-antigravity", "gemini-3-flash");
		const normalized = normalizeToolSchema(model, schema).schema as {
			properties?: { sentiment?: { enum?: string[]; anyOf?: unknown } };
		};

		expect(normalized.properties?.sentiment?.enum).toEqual(["positive", "negative", "neutral"]);
		expect(normalized.properties?.sentiment?.anyOf).toBeUndefined();
	});

	it("leaves non-Google providers untouched", () => {
		const schema = Type.Object({
			value: Type.Union([Type.Literal("a"), Type.Literal("b")]),
		});
		const model = getModel("openai-codex", "gpt-5.2");

		const normalized = normalizeToolSchema(model, schema);

		expect(normalized.schema).toBe(schema);
		expect(normalized.unwrapKey).toBeNull();
	});
});
