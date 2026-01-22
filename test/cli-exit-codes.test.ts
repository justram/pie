import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { MaxTurnsError } from "../src/index.js";

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

function createStream<T>(events: ExtractEvent<T>[], result: ExtractResult<T> | undefined): ExtractStream<T> {
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

describe("cli exit codes", () => {
	it("returns 1 on max turns", async () => {
		const restoreEnv = withTestApiKey();
		const error = new MaxTurnsError("Extraction failed", 3);
		try {
			const events: ExtractEvent<Record<string, unknown>>[] = [{ type: "error", error, turns: 3 }];
			const extractFn = () => createStream(events, undefined);

			const stderr = createWritable();
			const exitCode = await runCli([
				"-s",
				"{\"type\":\"object\"}",
				"-p",
				"Prompt",
			], {
				extractFn: extractFn as any,
				stdin: Readable.from(["input"]),
				stderr: stderr.writable,
				stdout: createWritable().writable,
			});

			expect(exitCode).toBe(1);
			expect(stderr.read()).toContain("Extraction failed");
		} finally {
			restoreEnv();
		}
	});

	it("returns 2 on invalid args", async () => {
		const stderr = createWritable();
		const exitCode = await runCli([], {
			stdin: Readable.from(["input"]),
			stderr: stderr.writable,
			stdout: createWritable().writable,
		});

		expect(exitCode).toBe(2);
		expect(stderr.read()).toContain("Missing required option");
	});

	it("returns 4 on missing attachment", async () => {
		const stderr = createWritable();
		const exitCode = await runCli([
			"-s",
			"{\"type\":\"object\"}",
			"-p",
			"Prompt",
			"-a",
			"/missing/file.txt",
		], {
			stdin: Readable.from(["input"]),
			stderr: stderr.writable,
			stdout: createWritable().writable,
		});

		expect(exitCode).toBe(4);
		expect(stderr.read()).toContain("Failed to load attachments");
	});
});
