import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHANGELOG_PATH = path.join(process.cwd(), "CHANGELOG.md");
const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json");

function runCommand(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.error) {
		throw result.error;
	}
	return result.status ?? 0;
}

async function readVersion() {
	const raw = await fs.readFile(PACKAGE_JSON_PATH, "utf-8");
	const pkg = JSON.parse(raw);
	if (!pkg.version || typeof pkg.version !== "string") {
		throw new Error("package.json does not contain a valid version.");
	}
	return pkg.version;
}

function normalizeTag(version) {
	return version.startsWith("v") ? version : `v${version}`;
}

function extractReleaseNotes(changelog, version) {
	const lines = changelog.split(/\r?\n/);
	const header = `## ${version}`;
	const startIndex = lines.findIndex((line) => line.trim() === header);
	if (startIndex === -1) {
		throw new Error(`Changelog section not found for ${version}.`);
	}

	const contentLines = [];
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		if (lines[i].startsWith("## ")) {
			break;
		}
		contentLines.push(lines[i]);
	}

	const content = contentLines.join("\n").trim();
	if (!content) {
		throw new Error(`Changelog section for ${version} is empty.`);
	}

	return `## ${version}\n\n${content}\n`;
}

async function main() {
	const versionArg = process.argv[2];
	const version = versionArg ?? (await readVersion());
	const tag = normalizeTag(version);

	const changelog = await fs.readFile(CHANGELOG_PATH, "utf-8");
	const notes = extractReleaseNotes(changelog, version);

	const tempPath = path.join(os.tmpdir(), `pie-release-${tag}.md`);
	await fs.writeFile(tempPath, notes, "utf-8");

	const viewStatus = runCommand("gh", ["release", "view", tag]);
	if (viewStatus === 0) {
		runCommand("gh", ["release", "edit", tag, "-t", tag, "-F", tempPath]);
		return;
	}

	runCommand("gh", ["release", "create", tag, "-t", tag, "-F", tempPath]);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
