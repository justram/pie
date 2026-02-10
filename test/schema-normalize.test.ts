import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { normalizeToolSchema } from "../src/core/schema/normalize.js";

describe("normalizeToolSchema", () => {
	it("normalizes literal unions for schema-constrained providers", () => {
		const schema = Type.Object({
			sentiment: Type.Union([Type.Literal("positive"), Type.Literal("negative"), Type.Literal("neutral")]),
		});

		const model = { provider: "google-antigravity" } as any;
		const normalized = normalizeToolSchema(model, schema).schema as {
			properties?: { sentiment?: { enum?: string[]; anyOf?: unknown } };
		};

		expect(normalized.properties?.sentiment?.enum).toEqual(["positive", "negative", "neutral"]);
		expect(normalized.properties?.sentiment?.anyOf).toBeUndefined();
	});

	it("resolves local refs, strips unsupported keys, and converts const literals", () => {
		const recursiveNode = {
			type: "object",
			properties: {
				next: { $ref: "#/$defs/node" },
				kind: { const: "leaf", examples: ["x"] },
				choice: {
					type: "string",
					anyOf: [{ const: "a" }, { const: "b" }],
				},
			},
		};

		const schema = {
			type: "object",
			properties: { root: { $ref: "#/$defs/node" } },
			$defs: { node: recursiveNode },
		} as any;

		const normalized = normalizeToolSchema({ provider: "google-gemini-cli" } as any, schema).schema as any;
		const root = normalized.properties.root;

		expect(normalized.$defs).toBeUndefined();
		expect(root.properties.kind.enum).toEqual(["leaf"]);
		expect(root.properties.kind.examples).toBeUndefined();
		expect(root.properties.choice.enum).toEqual(["a", "b"]);
		expect(root.properties.choice.type).toBeUndefined();
		// recursive refs are left as refs once recursion is detected
		expect(root.properties.next.$ref).toBe("#/$defs/node");
	});

	it("wraps non-object schema for providers requiring object tool schemas", () => {
		const schema = Type.String();
		const normalized = normalizeToolSchema({ provider: "openai-codex" } as any, schema);

		expect(normalized.unwrapKey).toBe("value");
		expect((normalized.schema as any).type).toBe("object");
		expect((normalized.schema as any).required).toEqual(["value"]);
	});

	it("leaves non-constrained providers untouched", () => {
		const schema = Type.Object({
			value: Type.Union([Type.Literal("a"), Type.Literal("b")]),
		});

		const normalized = normalizeToolSchema({ provider: "anthropic" } as any, schema);

		expect(normalized.schema).toBe(schema);
		expect(normalized.unwrapKey).toBeNull();
	});
});
