import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as readline from "node:readline";

const REPORT_PROMPT = `Deep dive into this codebase to build comprehensive understanding. Read files systematically until you have god-level knowledge of the architecture, patterns, and how everything connects.
Strategy:
1. Start with tree/find to map the structure
2. Read core entry points and main modules
3. Follow imports to understand dependencies
4. Read types, configs, and documentation
5. Check for examples or tests that reveal usage patterns

After reading, synthesize your understanding into a clear summary covering:
- What it is and its purpose
- Architecture overview (key files and their roles)
- Core abstractions and data flow
- Key features and patterns
- Any gotchas or notable design decisions
`;

const INCREMENTAL_REPORT_PROMPT = `Update the existing report based on the changed files listed below. Focus only on the diffs and how they affect architecture, flows, and key behaviors.

Instructions:
- Read ONLY the files listed under "Changed files" unless you must follow an import for context.
- Prefer diffs and local context; avoid full repo scans.
- Summarize what changed and any new gotchas.
- Preserve the previous report structure unless the architecture changed.
`;

const REPORT_PATH = path.join("docs", "agent", "reports.md");
const STATE_PATH = path.join("docs", "agent", "preindex.json");
const AGENT_DIR = path.join("docs", "agent");

const WATCHED_PATHS = [
	"src",
	"docs",
	"examples",
	"test",
	"spec",
	"README.md",
	"package.json",
	"package-lock.json",
	"tsconfig.base.json",
	"tsconfig.build.json",
	"biome.json",
	"eslint.config.js",
	"bin",
	"scripts",
];

const EXCLUDE_PATHS = [":(exclude)docs/agent"];

type RunResult = {
	stdout: string;
	stderr: string;
	code: number | null;
};

type RunCommandOptions = {
	cwd?: string;
	timeoutMs?: number;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
};

type RpcResponse = {
	type: "response";
	command: string;
	success: boolean;
	id?: string;
	data?: Record<string, unknown> | null;
	error?: string;
};

type RpcEvent = {
	type: string;
	[key: string]: unknown;
};

type ProgressState = {
	startTime: number;
	lastStatus: string;
	readCount: number;
	bashCount: number;
	toolCount: number;
	lastTool: string | null;
	lastFile: string | null;
};

type PreindexState = {
	generatedAt: string;
	gitHead: string | null;
	promptHash: string;
	reportPath: string;
	watchedPaths: string[];
};

type UpdatePlan = {
	mode: "full" | "incremental";
	files: string[];
};

type ExternalReport = {
	content: string;
	source: string;
};

function promptHash(prompt: string): string {
	return createHash("sha256").update(prompt).digest("hex");
}

function currentPromptHash(): string {
	return promptHash(`${REPORT_PROMPT}\n${INCREMENTAL_REPORT_PROMPT}`);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function runCommand(args: string[], options: RunCommandOptions = {}): Promise<RunResult> {
	return await new Promise((resolve, reject) => {
		const child = spawn(args[0], args.slice(1), {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		const timeout = options.timeoutMs
			? setTimeout(() => {
				child.kill("SIGKILL");
			}, options.timeoutMs)
			: undefined;

		child.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			stdout += text;
			options.onStdout?.(text);
		});

		child.stderr.on("data", (chunk) => {
			const text = chunk.toString();
			stderr += text;
			options.onStderr?.(text);
		});

		child.on("error", (err) => {
			if (timeout) clearTimeout(timeout);
			reject(err);
		});

		child.on("close", (code) => {
			if (timeout) clearTimeout(timeout);
			resolve({ stdout, stderr, code });
		});
	});
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

function lastNonEmptyLine(chunk: string): string | null {
	const lines = chunk.split(/\r?\n/);
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const trimmed = lines[i].trim();
		if (trimmed) {
			return trimmed;
		}
	}
	return null;
}

function isRpcResponse(value: unknown): value is RpcResponse {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return record.type === "response" && typeof record.command === "string" && typeof record.success === "boolean";
}

function getResponseData<T extends Record<string, unknown>>(response: RpcResponse): T {
	if (!response.success) {
		throw new Error(response.error ?? `RPC command failed: ${response.command}`);
	}
	if (!response.data || typeof response.data !== "object") {
		throw new Error(`RPC command returned no data: ${response.command}`);
	}
	return response.data as T;
}

function readStringField(record: RpcEvent, field: string): string | null {
	const value = record[field];
	return typeof value === "string" ? value : null;
}

function readObjectField(record: RpcEvent, field: string): Record<string, unknown> | null {
	const value = record[field];
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}

function formatToolArgs(toolName: string, args: Record<string, unknown> | null): string {
	if (!args) return toolName;

	switch (toolName) {
		case "read": {
			const path = typeof args.path === "string" ? args.path : null;
			const offset = typeof args.offset === "number" ? args.offset : null;
			const limit = typeof args.limit === "number" ? args.limit : null;
			const parts = [path ?? "read"];
			if (offset !== null) parts.push(`offset=${offset}`);
			if (limit !== null) parts.push(`limit=${limit}`);
			return parts.join(" ");
		}
		case "write": {
			const path = typeof args.path === "string" ? args.path : null;
			return path ? `write ${path}` : "write";
		}
		case "edit": {
			const path = typeof args.path === "string" ? args.path : null;
			return path ? `edit ${path}` : "edit";
		}
		case "bash": {
			const command = typeof args.command === "string" ? args.command : null;
			return command ? `bash ${truncate(command, 120)}` : "bash";
		}
		case "browser_nav": {
			const url = typeof args.url === "string" ? args.url : null;
			return url ? `browser nav ${truncate(url, 120)}` : "browser nav";
		}
		case "browser_content": {
			const url = typeof args.url === "string" ? args.url : null;
			return url ? `browser content ${truncate(url, 120)}` : "browser content";
		}
		default:
			return toolName;
	}
}

function formatRpcEvent(event: RpcEvent): string | null {
	switch (event.type) {
		case "agent_start":
			return "agent started";
		case "agent_end":
			return "agent completed";
		case "auto_compaction_start":
			return "auto compaction started";
		case "auto_compaction_end":
			return "auto compaction completed";
		case "auto_retry_start":
			return "auto retry started";
		case "auto_retry_end":
			return "auto retry completed";
		case "extension_error": {
			const message = readStringField(event, "error") ?? readStringField(event, "message");
			return message ? `extension error: ${truncate(message, 120)}` : "extension error";
		}
		default:
			return null;
	}
}

function formatStatusLine(state: ProgressState): string {
	const elapsedSeconds = Math.round((Date.now() - state.startTime) / 1000);
	const location = state.lastFile ? `file=${state.lastFile}` : "file=n/a";
	const tool = state.lastTool ? `tool=${state.lastTool}` : "tool=n/a";
	return `Preindex: ${state.lastStatus} | ${tool} ${location} | read=${state.readCount} bash=${state.bashCount} tools=${state.toolCount} | ${elapsedSeconds}s`;
}

function formatToolStatus(event: RpcEvent): { toolName: string; summary: string; path?: string } | null {
	if (event.type !== "tool_execution_start") {
		return null;
	}

	const toolName = readStringField(event, "toolName") ?? "tool";
	const args = readObjectField(event, "args");
	let path: string | undefined;
	if (toolName === "read") {
		const rawPath = typeof args?.path === "string" ? args.path : null;
		path = rawPath ?? undefined;
	}

	return { toolName, summary: formatToolArgs(toolName, args), path };
}

async function loadState(): Promise<PreindexState | null> {
	if (!(await fileExists(STATE_PATH))) return null;
	try {
		const raw = await fs.readFile(STATE_PATH, "utf-8");
		return JSON.parse(raw) as PreindexState;
	} catch {
		return null;
	}
}

async function loadExternalReport(root: string): Promise<ExternalReport | null> {
	const override = process.env.PREINDEX_INPUT?.trim();
	if (override) {
		const resolved = path.isAbsolute(override) ? override : path.join(root, override);
		if (!(await fileExists(resolved))) {
			throw new Error(`PREINDEX_INPUT not found: ${override}`);
		}
		const content = (await fs.readFile(resolved, "utf-8")).trim();
		if (!content) {
			throw new Error(`PREINDEX_INPUT is empty: ${override}`);
		}
		return { content, source: resolved };
	}

	const fallback = path.join(root, "reports.md");
	if (!(await fileExists(fallback))) return null;
	const content = (await fs.readFile(fallback, "utf-8")).trim();
	if (!content) return null;
	return { content, source: fallback };
}

async function writeState(state: PreindexState): Promise<void> {
	await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function getGitHead(): Promise<string | null> {
	try {
		const result = await runCommand(["git", "rev-parse", "HEAD"], { timeoutMs: 2000 });
		if (result.code !== 0) return null;
		return result.stdout.trim() || null;
	} catch {
		return null;
	}
}

async function listGitDiff(args: string[]): Promise<string[] | null> {
	try {
		const result = await runCommand(["git", "diff", "--name-only", ...args], { timeoutMs: 10_000 });
		if (result.code !== 0) return null;
		return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
	} catch {
		return null;
	}
}

async function listGitUntracked(args: string[]): Promise<string[] | null> {
	try {
		const result = await runCommand([
			"git",
			"status",
			"--porcelain",
			"-z",
			"--untracked-files=all",
			...args,
		], { timeoutMs: 10_000 });
		if (result.code !== 0) return null;
		return result.stdout
			.split("\0")
			.map((entry) => entry.trim())
			.filter((entry) => entry.startsWith("?? "))
			.map((entry) => entry.slice(3))
			.filter(Boolean);
	} catch {
		return null;
	}
}

async function isGitAvailable(): Promise<boolean> {
	try {
		const result = await runCommand(["git", "--version"], { timeoutMs: 2000 });
		return result.code === 0;
	} catch {
		return false;
	}
}

async function shouldUpdate(state: PreindexState | null, currentHead: string | null): Promise<boolean> {
	if (!(await fileExists(REPORT_PATH))) return true;

	const hash = currentPromptHash();
	if (!state || state.promptHash !== hash) return true;
	if (!currentHead || !(await isGitAvailable())) return true;
	if (!state.gitHead) return true;

	const pathspecs = [...WATCHED_PATHS, ...EXCLUDE_PATHS];
	const rangeDiff = await listGitDiff([`${state.gitHead}..HEAD`, "--", ...pathspecs]);
	if (!rangeDiff) return true;
	if (rangeDiff.length > 0) return true;

	const unstaged = await listGitDiff(["--", ...pathspecs]);
	const staged = await listGitDiff(["--cached", "--", ...pathspecs]);
	const untracked = await listGitUntracked(["--", ...pathspecs]);
	if (!unstaged || !staged || !untracked) return true;

	return unstaged.length > 0 || staged.length > 0 || untracked.length > 0;
}

async function planUpdate(state: PreindexState | null, currentHead: string | null): Promise<UpdatePlan> {
	if (!state || !currentHead || !(await isGitAvailable()) || !state.gitHead) {
		return { mode: "full", files: [] };
	}

	const pathspecs = [...WATCHED_PATHS, ...EXCLUDE_PATHS];
	const rangeDiff = (await listGitDiff([`${state.gitHead}..HEAD`, "--", ...pathspecs])) ?? [];
	const unstaged = (await listGitDiff(["--", ...pathspecs])) ?? [];
	const staged = (await listGitDiff(["--cached", "--", ...pathspecs])) ?? [];
	const untracked = (await listGitUntracked(["--", ...pathspecs])) ?? [];

	const files = new Set([...rangeDiff, ...unstaged, ...staged, ...untracked]);
	const filtered = [...files].filter((file) => file && !file.startsWith("docs/agent/"));
	if (filtered.length === 0) {
		return { mode: "full", files: [] };
	}

	return { mode: "incremental", files: filtered.sort((a, b) => a.localeCompare(b)) };
}

function formatFileList(files: string[], max = 25): string {
	if (files.length <= max) {
		return files.map((file) => `- ${file}`).join("\n");
	}
	const head = files.slice(0, max).map((file) => `- ${file}`).join("\n");
	return `${head}\n- ...and ${files.length - max} more`;
}

function formatFileListForPrompt(files: string[]): string {
	return files.map((file) => `- ${file}`).join("\n");
}

function buildPrompt(plan: UpdatePlan): string {
	if (plan.mode === "full") {
		return REPORT_PROMPT;
	}

	const fileList = formatFileListForPrompt(plan.files);
	return `${INCREMENTAL_REPORT_PROMPT}\nChanged files:\n${fileList}\n\nBaseline report: ${REPORT_PATH}`;
}

async function generateReport(root: string, prompt: string): Promise<string> {
	const piCommand = process.env.PI_BIN?.trim() || "pi";
	const args = ["--mode", "rpc", "--no-session"];
	const progress: ProgressState = {
		startTime: Date.now(),
		lastStatus: "waiting for pi output",
		readCount: 0,
		bashCount: 0,
		toolCount: 0,
		lastTool: null,
		lastFile: null,
	};
	const seenFiles = new Set<string>();
	let lastLoggedProgress = "";
	let stderr = "";

	const interval = setInterval(() => {
		console.error(formatStatusLine(progress));
	}, 15_000);

	console.error("Preindex: starting pi in RPC mode...");
	const child = spawn(piCommand, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
	if (!child.stdout || !child.stdin) {
		throw new Error("Failed to start pi RPC process.");
	}
	const rl = readline.createInterface({ input: child.stdout });

	const pending = new Map<
		string,
		{ resolve: (response: RpcResponse) => void; reject: (error: Error) => void }
	>();
	const eventListeners = new Set<(event: RpcEvent) => void>();
	let requestId = 0;

	const onEvent = (listener: (event: RpcEvent) => void) => {
		eventListeners.add(listener);
		return () => eventListeners.delete(listener);
	};

	const handleEvent = (event: RpcEvent) => {
		const toolStatus = formatToolStatus(event);
		if (toolStatus) {
			progress.lastStatus = toolStatus.summary;
			progress.toolCount += 1;
			progress.lastTool = toolStatus.toolName;
			if (toolStatus.toolName === "read") {
				progress.readCount += 1;
				if (toolStatus.path) {
					progress.lastFile = toolStatus.path;
					if (!seenFiles.has(toolStatus.path)) {
						seenFiles.add(toolStatus.path);
						const line = `read ${toolStatus.path}`;
						if (line !== lastLoggedProgress) {
							lastLoggedProgress = line;
							console.error(`Preindex: ${line}`);
						}
					}
				}
			}
			if (toolStatus.toolName === "bash") {
				progress.bashCount += 1;
				const line = toolStatus.summary;
				if (line !== lastLoggedProgress) {
					lastLoggedProgress = line;
					console.error(`Preindex: ${line}`);
				}
			}
			if (toolStatus.toolName === "edit" || toolStatus.toolName === "write") {
				const line = toolStatus.summary;
				if (line !== lastLoggedProgress) {
					lastLoggedProgress = line;
					console.error(`Preindex: ${line}`);
				}
			}
		}

		const summary = formatRpcEvent(event);
		if (summary) {
			progress.lastStatus = summary;
			if (summary !== lastLoggedProgress) {
				lastLoggedProgress = summary;
				console.error(`Preindex: ${summary}`);
			}
		}

		for (const listener of eventListeners) {
			listener(event);
		}
	};

	const handleResponse = (response: RpcResponse) => {
		if (!response.id) {
			return;
		}
		const entry = pending.get(response.id);
		if (!entry) {
			return;
		}
		pending.delete(response.id);
		entry.resolve(response);
	};

	const waitForEvent = (type: string, timeoutMs: number): Promise<RpcEvent> =>
		new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				unsubscribe();
				reject(new Error(`Timeout waiting for ${type}.`));
			}, timeoutMs);
			const unsubscribe = onEvent((event) => {
				if (event.type === type) {
					clearTimeout(timeout);
					unsubscribe();
					resolve(event);
				}
			});
		});

	const sendCommand = async (command: Record<string, unknown>): Promise<RpcResponse> =>
		await new Promise((resolve, reject) => {
			const id = `req-${(requestId += 1)}`;
			pending.set(id, { resolve, reject });
			const payload = { id, ...command };
			child.stdin.write(`${JSON.stringify(payload)}\n`);
		});

	child.stderr.on("data", (chunk) => {
		const text = chunk.toString();
		stderr += text;
		process.stderr.write(text);
		const latest = lastNonEmptyLine(text);
		if (latest) {
			progress.lastStatus = latest;
		}
	});

	const cleanup = async () => {
		rl.close();
		child.stdin.end();
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 1000);
			child.on("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	};

	const overallTimeout = setTimeout(() => {
		for (const entry of pending.values()) {
			entry.reject(new Error("RPC command timed out."));
		}
		pending.clear();
	}, 30 * 60 * 1000);

	try {
		rl.on("line", (line) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			let payload: unknown;
			try {
				payload = JSON.parse(trimmed) as unknown;
			} catch (error) {
				console.error(`Preindex: failed to parse RPC line: ${trimmed}`);
				return;
			}
			if (isRpcResponse(payload)) {
				handleResponse(payload);
				return;
			}
			if (payload && typeof payload === "object" && typeof (payload as RpcEvent).type === "string") {
				handleEvent(payload as RpcEvent);
			}
		});

		child.on("exit", (code) => {
			if (code !== 0) {
				const error = new Error(`pi exited with code ${code}. ${stderr}`);
				for (const entry of pending.values()) {
					entry.reject(error);
				}
				pending.clear();
			}
		});

		console.error("Preindex: sending prompt to pi...");
		const promptResponse = await sendCommand({ type: "prompt", message: prompt });
		if (!promptResponse.success) {
			throw new Error(promptResponse.error ?? "Prompt command failed.");
		}

		await waitForEvent("agent_end", 30 * 60 * 1000);

		const textResponse = await sendCommand({ type: "get_last_assistant_text" });
		const data = getResponseData<{ text: string | null }>(textResponse);
		const output = data.text?.trim();
		if (!output) {
			throw new Error("pi produced empty output.");
		}

		try {
			const statsResponse = await sendCommand({ type: "get_session_stats" });
			const stats = getResponseData<{ tokens?: Record<string, number>; cost?: number }>(statsResponse);
			if (stats.tokens) {
				const tokens = stats.tokens as Record<string, number>;
				const parts = [
					`input=${tokens.input ?? 0}`,
					`output=${tokens.output ?? 0}`,
					`cacheRead=${tokens.cacheRead ?? 0}`,
					`cacheWrite=${tokens.cacheWrite ?? 0}`,
					`total=${tokens.total ?? 0}`,
				];
				const cost = typeof stats.cost === "number" ? ` cost=$${stats.cost.toFixed(4)}` : "";
				console.error(`Preindex: token usage ${parts.join(" ")}${cost}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Preindex: failed to fetch token stats (${message}).`);
		}

		return output;
	} finally {
		clearTimeout(overallTimeout);
		clearInterval(interval);
		await cleanup();
	}
}

async function main() {
	const root = process.cwd();
	await ensureDir(path.join(root, AGENT_DIR));

	console.error("Preindex: checking state...");
	const state = await loadState();
	const currentHead = await getGitHead();
	const needsUpdate = await shouldUpdate(state, currentHead);

	if (!needsUpdate) {
		console.error("Preindex: reports are up-to-date. Skipping generation.");
		return;
	}

	const promptChanged = !state || state.promptHash !== currentPromptHash();
	const gitAvailable = await isGitAvailable();
	const updatePlan = await planUpdate(state, currentHead);
	if (updatePlan.mode === "incremental") {
		console.error(`Preindex: incremental update (${updatePlan.files.length} files).`);
		console.error(formatFileList(updatePlan.files));
	} else {
		const reasons: string[] = [];
		if (!state) {
			reasons.push("no previous state");
		}
		if (!gitAvailable) {
			reasons.push("git unavailable");
		}
		if (!currentHead) {
			reasons.push("no git HEAD");
		}
		if (state && !state.gitHead) {
			reasons.push("no previous git head");
		}
		if (promptChanged) {
			reasons.push("prompt changed");
		}
		const detail = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";
		console.error(`Preindex: full update${detail}.`);
	}

	const externalReport = await loadExternalReport(root);
	let report = "";

	if (externalReport) {
		const relativeSource = path.relative(root, externalReport.source);
		console.error(`Preindex: using existing report from ${relativeSource}.`);
		report = externalReport.content;
	} else {
		console.error("Preindex: generating deep-dive report with pi...");
		report = await generateReport(root, buildPrompt(updatePlan));
	}

	console.error("Preindex: writing report...");
	await fs.writeFile(path.join(root, REPORT_PATH), `${report}\n`, "utf-8");

	if (externalReport) {
		const rootReport = path.join(root, "reports.md");
		if (path.resolve(externalReport.source) === path.resolve(rootReport)) {
			await fs.rm(rootReport, { force: true });
		}
	}

	console.error("Preindex: writing state...");
	const nextState: PreindexState = {
		generatedAt: new Date().toISOString(),
		gitHead: currentHead,
		promptHash: currentPromptHash(),
		reportPath: REPORT_PATH,
		watchedPaths: WATCHED_PATHS,
	};
	await writeState(nextState);
	console.error("Preindex: report updated.");
}

void main().catch((error) => {
	console.error("Preindex failed.");
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
