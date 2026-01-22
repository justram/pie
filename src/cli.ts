#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { main } from "./main.js";

export { type CliDeps, runCli } from "./cli/index.js";

async function run(): Promise<void> {
	const exitCode = await main(process.argv.slice(2));
	process.exitCode = exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	void run().catch((error) => {
		const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}
