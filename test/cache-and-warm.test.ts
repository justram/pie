import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFileCache } from "../src/core/cache/file.js";
import { computeCacheKey } from "../src/core/cache/key.js";
import { createMemoryCache } from "../src/core/cache/memory.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("cache stores", () => {
	it("computes stable cache keys and differentiates model/validators", () => {
		const schema = Type.Object({ value: Type.String() });
		const baseOptions = {
			schema,
			prompt: "Extract",
			model: { name: "provider/model-a" },
		};

		const keyA = computeCacheKey("input", baseOptions as any);
		const keyARepeat = computeCacheKey("input", baseOptions as any);
		const keyB = computeCacheKey("input", { ...baseOptions, model: { name: "provider/model-b" } } as any);

		expect(keyA).toHaveLength(64);
		expect(keyA).toBe(keyARepeat);
		expect(keyB).not.toBe(keyA);
	});

	it("evicts least-recently-used entries in memory cache", async () => {
		const cache = createMemoryCache({ maxSize: 2 });

		await cache.set("a", { value: 1 });
		await cache.set("b", { value: 2 });
		await cache.get("a");
		await cache.set("c", { value: 3 });

		expect(await cache.get("b")).toBeUndefined();
		expect(await cache.get("a")).toEqual({ value: 1 });
		expect(await cache.get("c")).toEqual({ value: 3 });

		await cache.delete("a");
		expect(await cache.get("a")).toBeUndefined();

		await cache.clear();
		expect(await cache.get("c")).toBeUndefined();
	});

	it("persists entries in file cache and supports clear", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pie-file-cache-"));
		tempDirs.push(dir);
		const cache = createFileCache({ directory: `${dir}///` });

		await cache.set("abcdef", { value: { ok: true } });
		expect(await cache.get("abcdef")).toEqual({ value: { ok: true } });

		await cache.delete("abcdef");
		expect(await cache.get("abcdef")).toBeUndefined();

		await cache.set("abcdef", { value: { ok: true } });
		await cache.clear();
		expect(await cache.get("abcdef")).toBeUndefined();
	});
});

describe("warmCache", () => {
	it("forces cache revalidation when function validators are present", async () => {
		const extractSync = vi.fn(async () => ({ ok: true }));
		vi.doMock("../src/extract.js", () => ({ extractSync }));
		const { warmCache } = await import("../src/cache/warm.js");

		await warmCache(["a", "b"], {
			schema: Type.Object({ ok: Type.Boolean() }),
			prompt: "Extract",
			model: { name: "provider/model" } as any,
			validate: () => undefined,
			cache: { store: createMemoryCache() },
		} as any);

		expect(extractSync).toHaveBeenCalledTimes(2);
		for (const call of extractSync.mock.calls) {
			expect(call[1].cache).toMatchObject({ revalidate: true });
		}
	});

	it("defaults cache to true when validators are absent", async () => {
		const extractSync = vi.fn(async () => ({ ok: true }));
		vi.doMock("../src/extract.js", () => ({ extractSync }));
		const { warmCache } = await import("../src/cache/warm.js");

		await warmCache(["input"], {
			schema: Type.Object({ ok: Type.Boolean() }),
			prompt: "Extract",
			model: { name: "provider/model" } as any,
		} as any);

		expect(extractSync).toHaveBeenCalledTimes(1);
		expect(extractSync.mock.calls[0][1].cache).toBe(true);
	});

	it("converts cache=true into revalidate=true when async validators exist", async () => {
		const extractSync = vi.fn(async () => ({ ok: true }));
		vi.doMock("../src/extract.js", () => ({ extractSync }));
		const { warmCache } = await import("../src/cache/warm.js");

		await warmCache(["input"], {
			schema: Type.Object({ ok: Type.Boolean() }),
			prompt: "Extract",
			model: { name: "provider/model" } as any,
			validateAsync: async () => undefined,
			cache: true,
		} as any);

		expect(extractSync.mock.calls[0][1].cache).toEqual({ revalidate: true });
	});
});
