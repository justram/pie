import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandValidationError, HttpValidationError } from "../src/core/errors.js";
import { runCommandValidator } from "../src/core/validators/command.js";
import { runHttpValidator } from "../src/core/validators/http.js";
import { createValidationEmitter, runValidators } from "../src/core/validators/index.js";
import { runShell } from "../src/core/validators/shell.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("shell + command validator", () => {
	it("runs shell command with and without stdin", async () => {
		const withStdin = await runShell("cat", { stdin: "hello" });
		expect(withStdin.code).toBe(0);
		expect(withStdin.stdout).toContain("hello");

		const withoutStdin = await runShell("printf ok");
		expect(withoutStdin.code).toBe(0);
		expect(withoutStdin.stdout).toBe("ok");
	});

	it("throws CommandValidationError on non-zero exit", async () => {
		await expect(runCommandValidator({ ok: true }, "echo fail >&2; exit 7")).rejects.toMatchObject<CommandValidationError>({
			name: "CommandValidationError",
			exitCode: 7,
		});
	});
});

describe("http validator", () => {
	it("passes when validator endpoint returns ok", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(runHttpValidator({ ok: true }, "https://validator.test/ok")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("throws HttpValidationError and extracts message from JSON body", async () => {
		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({ error: "invalid payload" }), {
				status: 400,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(runHttpValidator({ ok: false }, "https://validator.test/fail")).rejects.toMatchObject<HttpValidationError>({
			name: "HttpValidationError",
			statusCode: 400,
			message: "invalid payload",
		});
	});

	it("falls back to text body or status when response is not JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(new Response("plain-text failure", { status: 422 }))
				.mockResolvedValueOnce(new Response("", { status: 503 })),
		);

		await expect(runHttpValidator({}, "https://validator.test/text")).rejects.toMatchObject<HttpValidationError>({
			message: "plain-text failure",
			statusCode: 422,
		});

		await expect(runHttpValidator({}, "https://validator.test/empty")).rejects.toMatchObject<HttpValidationError>({
			message: "Validator returned 503",
			statusCode: 503,
		});
	});
});

describe("runValidators", () => {
	it("emits start/pass/fail events across sync/async/command/http layers", async () => {
		const events: Array<{ type: string; layer: string; error?: string }> = [];
		const emitter = createValidationEmitter((event) => events.push(event));

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: "remote bad" }), { status: 422 }));
		vi.stubGlobal("fetch", fetchMock);

		await runValidators(
			{ value: 1 },
			{
				schema: { type: "object" },
				prompt: "Extract",
				model: { name: "provider/model" },
				validate: () => undefined,
				validateAsync: async () => undefined,
				validateCommand: "true",
				validateUrl: "https://validator.test/pass",
			} as any,
			emitter,
		);

		expect(events).toEqual([
			{ type: "validation_start", layer: "sync" },
			{ type: "validation_pass", layer: "sync" },
			{ type: "validation_start", layer: "async" },
			{ type: "validation_pass", layer: "async" },
			{ type: "validation_start", layer: "command" },
			{ type: "validation_pass", layer: "command" },
			{ type: "validation_start", layer: "http" },
			{ type: "validation_pass", layer: "http" },
		]);

		await expect(
			runValidators(
				{ value: 2 },
				{
					schema: { type: "object" },
					prompt: "Extract",
					model: { name: "provider/model" },
					validateUrl: "https://validator.test/fail",
				} as any,
				emitter,
			),
		).rejects.toBeInstanceOf(HttpValidationError);

		expect(events.at(-1)).toMatchObject({ type: "validation_error", layer: "http", error: "remote bad" });
	});

	it("emits failures for sync and async validator exceptions", async () => {
		const events: Array<{ type: string; layer: string; error?: string }> = [];
		const emitter = createValidationEmitter((event) => events.push(event));

		await expect(
			runValidators(
				{},
				{
					schema: { type: "object" },
					prompt: "Extract",
					model: { name: "provider/model" },
					validate: () => {
						throw "sync failed";
					},
				} as any,
				emitter,
			),
		).rejects.toBe("sync failed");
		expect(events.at(-1)).toMatchObject({ type: "validation_error", layer: "sync", error: "sync failed" });

		await expect(
			runValidators(
				{},
				{
					schema: { type: "object" },
					prompt: "Extract",
					model: { name: "provider/model" },
					validateAsync: async () => {
						throw new Error("async failed");
					},
				} as any,
				emitter,
			),
		).rejects.toThrow("async failed");
		expect(events.at(-1)).toMatchObject({ type: "validation_error", layer: "async", error: "async failed" });
	});
});
