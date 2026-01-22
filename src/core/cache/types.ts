import type { ExtractOptions, Usage } from "../types.js";

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	turns: number;
	usage: Usage;
}

export interface CacheStore {
	get<T>(key: string): Promise<CacheEntry<T> | undefined>;
	set<T>(key: string, entry: CacheEntry<T>, ttl?: number): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

export interface CacheOptions {
	ttl?: number;
	key?: (input: string, options: ExtractOptions<unknown>) => string;
	store?: CacheStore;
	revalidate?: boolean;
}
