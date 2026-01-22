import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

import type { ExtractEvent, ExtractOptions, ExtractResult, ExtractStream } from "../src/index.js";

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

function createConfigModule(path: string): void {
	writeFileSync(
		path,
		[
			"export default function config({ input, resolveModel }) {",
			"\treturn {",
			"\t\tinput: `config:${input}` ,",
			"\t\toptions: {",
			"\t\t\tschema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },",
			"\t\t\tprompt: 'Config prompt',",
			"\t\t\tmodel: resolveModel('claude-sonnet'),",
			"\t\t\tvalidate: (data) => { if (!data.ok) throw new Error('invalid'); },",
			"\t\t},",
			"\t};",
			"}",
		].join("\n"),
		"utf8",
	);
}

describe("cli config", () => {
	it("loads options from config", async () => {
		const restoreEnv = withTestApiKey();
		const dir = mkdtempSync(join(tmpdir(), "pi-extract-config-"));
		try {
			const configPath = join(dir, "config.mjs");
			createConfigModule(configPath);

			let capturedInput = "";
			let capturedOptions: ExtractOptions<unknown> | undefined;
			const extractFn = (input: string, options: ExtractOptions<unknown>) => {
				capturedInput = input;
				capturedOptions = options;
				const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
				const events: ExtractEvent<Record<string, unknown>>[] = [
					{ type: "start", maxTurns: 3 },
					{ type: "complete", result: { ok: true }, turns: 1, usage },
				];
				return createStream(events, { data: { ok: true }, turns: 1, usage });
			};

			const stdout = createWritable();
			const stderr = createWritable();
			const exitCode = await runCli(["--config", configPath], {
				extractFn: extractFn as any,
				stdin: Readable.from(["stdin input"]),
				stdout: stdout.writable,
				stderr: stderr.writable,
			});

			expect(exitCode).toBe(0);
			expect(capturedInput).toBe("config:stdin input");
			expect(capturedOptions?.prompt).toBe("Config prompt");
			expect(typeof capturedOptions?.validate).toBe("function");
			expect(stdout.read()).toContain("ok");
			expect(stderr.read()).toBe("");
		} finally {
			restoreEnv();
		}
	});
});
