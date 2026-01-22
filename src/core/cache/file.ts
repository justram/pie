import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import type { CacheEntry, CacheStore } from "./types.js";

function cachePath(directory: string, key: string): string {
	const prefix = key.slice(0, 2);
	return `${directory}/${prefix}/${key}.json`;
}

function cacheDir(directory: string, key: string): string {
	return `${directory}/${key.slice(0, 2)}`;
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export function createFileCache(options: { directory: string }): CacheStore {
	const directory = options.directory.replaceAll(/\/+$/g, "");

	return {
		get: async <T>(key: string): Promise<CacheEntry<T> | undefined> => {
			const path = cachePath(directory, key);
			if (!(await exists(path))) {
				return undefined;
			}
			const text = await readFile(path, { encoding: "utf8" });
			return JSON.parse(text) as CacheEntry<T>;
		},
		set: async (key, entry) => {
			const dir = cacheDir(directory, key);
			await mkdir(dir, { recursive: true });
			const path = cachePath(directory, key);
			await writeFile(path, JSON.stringify(entry), { encoding: "utf8" });
		},
		delete: async (key) => {
			const path = cachePath(directory, key);
			await rm(path, { force: true });
		},
		clear: async () => {
			await rm(directory, { recursive: true, force: true });
			await mkdir(directory, { recursive: true });
		},
	};
}
