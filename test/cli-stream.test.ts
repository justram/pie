import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

import type { ExtractEvent, ExtractResult, ExtractStream } from "../src/index.js";

function withTestApiKey(): () => void {
	const previous = process.env.ANTHROPIC_API_KEY;
	process.env.ANTHROPIC_API_KEY = "test-key";
	return () => {
		if (previous === undefined) {
			delete process.env.ANTHROPIC_API_KEY;
		} else {
			process.env.ANTHROPIC_API_KEY = previous;
		}
	};
}

function createStream<T>(events: ExtractEvent<T>[], result: ExtractResult<T>): ExtractStream<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const event of events) {
				yield event;
			}
		},
		result: async () => result,
		abort: () => undefined,
	};
}

function createWritable(): { writable: Writable; read: () => string } {
	let data = "";
	const writable = new Writable({
		write(chunk, _encoding, callback) {
			data += chunk.toString();
			callback();
		},
	});
	return { writable, read: () => data };
}

describe("cli streaming", () => {
	it("emits partial JSON to stderr", async () => {
		const restoreEnv = withTestApiKey();
		const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
		try {
			const events: ExtractEvent<Record<string, unknown>>[] = [
				{ type: "start", maxTurns: 3 },
				{ type: "turn_start", turn: 1 },
				{ type: "llm_delta", delta: "{\"sentiment\":\"posi" },
				{ type: "llm_delta", delta: "tive\"}" },
				{ type: "complete", result: { sentiment: "positive" }, turns: 1, usage },
			];

			const extractFn = () => createStream(events, { data: { sentiment: "positive" }, turns: 1, usage });
			const stdout = createWritable();
			const stderr = createWritable();
			const exitCode = await runCli([
				"-s",
				"{\"type\":\"object\"}",
				"-p",
				"Prompt",
				"--stream",
			], {
				extractFn: extractFn as any,
				stdin: Readable.from(["input"]),
				stdout: stdout.writable,
				stderr: stderr.writable,
			});

			expect(exitCode).toBe(0);
			expect(stderr.read()).toContain("\"partial\"");
			expect(stderr.read()).toContain("sentiment");
			expect(stdout.read()).toContain("positive");
		} finally {
			restoreEnv();
		}
	});
});
