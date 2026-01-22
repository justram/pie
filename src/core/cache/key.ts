import { createHash } from "node:crypto";

import type { ExtractOptions } from "../types.js";

export function computeCacheKey(input: string, options: ExtractOptions<unknown>): string {
	const keyData = {
		input,
		schema: JSON.stringify(options.schema),
		prompt: options.prompt,
		model: options.model?.name ?? "unknown",
		validateCommand: options.validateCommand ?? null,
		validateUrl: options.validateUrl ?? null,
	};
	return createHash("sha256").update(JSON.stringify(keyData)).digest("hex");
}
