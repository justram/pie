import type { Message } from "@mariozechner/pi-ai";
import { extractSync } from "../extract.js";
import type { ExtractOptions } from "../types.js";

function normalizeCache<T>(options: ExtractOptions<T>): ExtractOptions<T>["cache"] {
	const raw = options.cache;
	const hasFunctionValidators = Boolean(options.validate || options.validateAsync);

	if (!raw) {
		return hasFunctionValidators ? { revalidate: true } : true;
	}

	if (raw === true) {
		return hasFunctionValidators ? { revalidate: true } : true;
	}

	const cache = { ...raw };
	if (hasFunctionValidators && cache.revalidate === undefined) {
		cache.revalidate = true;
	}
	return cache;
}

export async function warmCache<T>(inputs: Array<string | Message[]>, options: ExtractOptions<T>): Promise<void> {
	const cache = normalizeCache(options);
	const warmedOptions = { ...options, cache };

	for (const input of inputs) {
		await extractSync(input, warmedOptions);
	}
}
