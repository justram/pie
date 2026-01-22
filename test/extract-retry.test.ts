import { type AssistantMessage,AssistantMessageEventStream, getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { extract } from "../src/extract.js";

describe("extract retry", () => {
	it("retries after schema validation failure", async () => {
		const schema = Type.Object({
			sentiment: Type.String({ enum: ["positive", "negative"] }),
			confidence: Type.Number({ minimum: 0, maximum: 1 }),
			meta: Type.Object({
				source: Type.String(),
				tags: Type.Array(Type.String()),
			}),
			items: Type.Array(
				Type.Object({
					name: Type.String(),
					score: Type.Number({ minimum: 0, maximum: 1 }),
				}),
			),
		});

		const model = getModel("openai-codex", "gpt-5.2");
		let callCount = 0;

		const streamFn = () => {
			const stream = new AssistantMessageEventStream();
			const attempt = callCount++;
			const args =
				attempt === 0
					? { sentiment: "positive", meta: { source: "unit", tags: [] } }
					: {
						sentiment: "positive",
						confidence: 0.9,
						meta: { source: "unit", tags: ["fast"] },
						items: [{ name: "speed", score: 0.8 }],
						};
			const message: AssistantMessage = {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: `call_${attempt}`,
						name: "respond",
						arguments: args,
					},
				],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "toolUse",
				timestamp: Date.now(),
			};

			queueMicrotask(() => {
				stream.push({ type: "done", reason: "toolUse", message });
			});

			return stream;
		};

		const result = await extract("Test", {
			schema,
			prompt: "Extract sentiment.",
			model,
			maxTurns: 2,
			streamFn,
		}).result();

		expect(result?.data).toEqual({
			sentiment: "positive",
			confidence: 0.9,
			meta: { source: "unit", tags: ["fast"] },
			items: [{ name: "speed", score: 0.8 }],
		});
		expect(result?.turns).toBe(2);
	});
});
