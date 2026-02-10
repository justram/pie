import { spawn } from "node:child_process";

export interface ShellResult {
	code: number;
	stdout: string;
	stderr: string;
}

export async function runShell(
	command: string,
	options?: { stdin?: string; signal?: AbortSignal },
): Promise<ShellResult> {
	const child = spawn("sh", ["-c", command], {
		stdio: ["pipe", "pipe", "pipe"],
		signal: options?.signal,
	});

	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

	let stdinError: Error | undefined;
	child.stdin.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code !== "EPIPE") {
			stdinError = error;
		}
	});

	try {
		if (options?.stdin !== undefined) {
			child.stdin.write(options.stdin);
		}
		child.stdin.end();
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code !== "EPIPE") {
			throw error;
		}
	}

	const code = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (value) => resolve(value ?? 0));
	});

	if (stdinError) {
		throw stdinError;
	}

	return {
		code,
		stdout: Buffer.concat(stdoutChunks).toString("utf8"),
		stderr: Buffer.concat(stderrChunks).toString("utf8"),
	};
}
