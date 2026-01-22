import { CommandValidationError } from "../errors.js";

import { runShell } from "./shell.js";

export async function runCommandValidator(data: unknown, command: string, signal?: AbortSignal): Promise<void> {
	const result = await runShell(command, { stdin: JSON.stringify(data), signal });
	if (result.code === 0) {
		return;
	}

	const message = result.stderr.trim() || `Command exited with code ${result.code}`;
	throw new CommandValidationError(message, command, result.code);
}
