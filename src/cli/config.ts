import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Message, Model } from "@mariozechner/pi-ai";
import type { ExtractOptions } from "../core/types.js";
import type { CliArgs } from "./args.js";
import type { AttachmentLoadResult } from "./attachments.js";

export interface CliConfigContext {
	args: CliArgs;
	input: string;
	inputText: string;
	attachments: AttachmentLoadResult;
	resolveModel: (value: string) => Model<any>;
	resolveApiKeyForProvider: (provider: string) => Promise<string | undefined>;
}

export interface CliConfigResult<T> {
	options: ExtractOptions<T>;
	input?: string | Message[];
	output?: string;
	stream?: boolean;
	verbose?: boolean;
	quiet?: boolean;
}

export type CliConfig<T> = (context: CliConfigContext) => CliConfigResult<T> | Promise<CliConfigResult<T>>;

export async function loadCliConfig(path: string): Promise<CliConfig<unknown>> {
	const resolved = resolve(path);
	const url = pathToFileURL(resolved).href;
	let moduleExports: unknown;
	try {
		moduleExports = await import(url);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to load config file ${resolved}: ${message}`);
	}

	const candidate =
		(moduleExports as { default?: unknown; config?: unknown }).default ??
		(moduleExports as { config?: unknown }).config;

	if (typeof candidate !== "function") {
		throw new Error(`Config file ${resolved} must export a default function or a named export "config".`);
	}

	return candidate as CliConfig<unknown>;
}
