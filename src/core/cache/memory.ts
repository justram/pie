import type { CacheEntry, CacheStore } from "./types.js";

export function createMemoryCache(options?: { maxSize?: number }): CacheStore {
	const maxSize = options?.maxSize ?? 1000;
	const map = new Map<string, CacheEntry<unknown>>();

	return {
		get: async <T>(key: string): Promise<CacheEntry<T> | undefined> => {
			const entry = map.get(key);
			if (!entry) {
				return undefined;
			}

			// Refresh LRU
			map.delete(key);
			map.set(key, entry);
			return entry as CacheEntry<T>;
		},
		set: async (key, entry) => {
			map.delete(key);
			map.set(key, entry);

			while (map.size > maxSize) {
				const oldest = map.keys().next().value as string | undefined;
				if (!oldest) {
					break;
				}
				map.delete(oldest);
			}
		},
		delete: async (key) => {
			map.delete(key);
		},
		clear: async () => {
			map.clear();
		},
	};
}
