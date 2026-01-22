import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("cli input handling", () => {
	it("prefers file input over stdin", async () => {
		const restoreEnv = withTestApiKey();
		const dir = mkdtempSync(join(tmpdir(), "pie-"));
		try {
			const inputPath = join(dir, "input.txt");
			writeFileSync(inputPath, "file input", "utf8");

			let capturedInput = "";
			const extractFn = (input: string) => {
				capturedInput = input;
				const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
				const events: ExtractEvent<Record<string, unknown>>[] = [
					{ type: "start", maxTurns: 3 },
					{ type: "complete", result: { ok: true }, turns: 1, usage },
				];
				return createStream(events, { data: { ok: true }, turns: 1, usage });
			};

			const stdout = createWritable();
			const stderr = createWritable();
			const exitCode = await runCli(
				["-s", "{\"type\":\"object\"}", "-p", "Prompt", "-i", inputPath],
				{
					extractFn: extractFn as any,
					stdin: Readable.from(["stdin input"]),
					stdout: stdout.writable,
					stderr: stderr.writable,
				},
			);

			expect(exitCode).toBe(0);
			expect(capturedInput).toBe("file input");
			expect(stdout.read()).toContain("ok");
			expect(stderr.read()).toBe("");
		} finally {
			restoreEnv();
		}
	});

	it("reads stdin when no input file is provided", async () => {
		const restoreEnv = withTestApiKey();
		try {
			let capturedInput = "";
			const extractFn = (input: string) => {
				capturedInput = input;
				const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
				const events: ExtractEvent<Record<string, unknown>>[] = [
					{ type: "start", maxTurns: 3 },
					{ type: "complete", result: { ok: true }, turns: 1, usage },
				];
				return createStream(events, { data: { ok: true }, turns: 1, usage });
			};

			const stdout = createWritable();
			const stderr = createWritable();
			const exitCode = await runCli(["-s", "{\"type\":\"object\"}", "-p", "Prompt"], {
				extractFn: extractFn as any,
				stdin: Readable.from(["stdin input"]),
				stdout: stdout.writable,
				stderr: stderr.writable,
			});

			expect(exitCode).toBe(0);
			expect(capturedInput).toBe("stdin input");
		} finally {
			restoreEnv();
		}
	});

	it("does not wait for stdin when running in a TTY", async () => {
		const restoreEnv = withTestApiKey();
		try {
			class HangingReadable extends Readable {
				override _read(): void {}
			}

			const stdin = new HangingReadable();
			(stdin as { isTTY?: boolean }).isTTY = true;

			let capturedInput = "";
			const extractFn = (input: string) => {
				capturedInput = input;
				const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
				const events: ExtractEvent<Record<string, unknown>>[] = [
					{ type: "start", maxTurns: 3 },
					{ type: "complete", result: { ok: true }, turns: 1, usage },
				];
				return createStream(events, { data: { ok: true }, turns: 1, usage });
			};

			const stdout = createWritable();
			const stderr = createWritable();
			const exitCode = await runCli(["-s", "{\"type\":\"object\"}", "-p", "Prompt"], {
				extractFn: extractFn as any,
				stdin,
				stdout: stdout.writable,
				stderr: stderr.writable,
			});

			stdin.destroy();

			expect(exitCode).toBe(0);
			expect(capturedInput).toBe("");
		} finally {
			restoreEnv();
		}
	});
});
