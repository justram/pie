import { type Message, streamSimple } from "@mariozechner/pi-ai";

import { extract as extractInternal, extractSync as extractSyncInternal } from "./core/extract.js";

import type { ExtractOptions, ExtractStream } from "./types.js";

export function extract<T>(input: string | Message[], options: ExtractOptions<T>): ExtractStream<T> {
	const streamFn =
		options.streamFn ??
		((model, context, streamOptions) => {
			streamOptions.onModelSelected?.(model);
			return streamSimple(model, context, streamOptions);
		});
	return extractInternal(input, { ...options, streamFn });
}

export async function extractSync<T>(input: string | Message[], options: ExtractOptions<T>): Promise<T> {
	const streamFn =
		options.streamFn ??
		((model, context, streamOptions) => {
			streamOptions.onModelSelected?.(model);
			return streamSimple(model, context, streamOptions);
		});
	return await extractSyncInternal(input, { ...options, streamFn });
}
