import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE_TYPES = new Set(["patch", "minor", "major"]);

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: "inherit", ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
	}
}

function runCapture(command, args) {
	const result = spawnSync(command, args, { encoding: "utf-8" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
	}
	return (result.stdout ?? "").toString();
}

function formatUnreleased(): string {
	return [
		"## [Unreleased]",
		"",
		"### Breaking Changes",
		"",
		"### Added",
		"",
		"### Changed",
		"",
		"### Fixed",
		"",
		"### Removed",
		"",
	].join("\n");
}

function hasUnreleasedEntries(body: string): boolean {
	return body
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("### "))
		.some((line) => line.length > 0);
}

function updateChangelog(contents: string, version: string): string {
	if (contents.includes(`## ${version}`)) {
		throw new Error(`CHANGELOG already contains version ${version}`);
	}

	const match = contents.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## |\n?$)/);
	if (!match || match.index === undefined) {
		throw new Error("CHANGELOG missing [Unreleased] section.");
	}

	const unreleasedBody = match[1].trimEnd();
	if (!hasUnreleasedEntries(unreleasedBody)) {
		throw new Error("CHANGELOG [Unreleased] section is empty.");
	}

	const before = contents.slice(0, match.index);
	const after = contents.slice(match.index + match[0].length).trimStart();
	const releaseSection = [`## ${version}`, "", unreleasedBody.trim(), ""].join("\n");

	return [before.trimEnd(), formatUnreleased(), "", releaseSection, "", after].join("\n").trimEnd() + "\n";
}

async function main() {
	const releaseType = process.argv[2];
	if (!releaseType || !RELEASE_TYPES.has(releaseType)) {
		throw new Error("Usage: node scripts/release.mjs <patch|minor|major>");
	}

	const status = runCapture("git", ["status", "--porcelain"]);
	if (status.trim()) {
		throw new Error("Working tree is not clean. Commit or stash changes before releasing.");
	}

	run("npm", ["version", releaseType, "--no-git-tag-version"]);

	const packagePath = path.join(process.cwd(), "package.json");
	const pkg = JSON.parse(await readFile(packagePath, "utf-8"));
	const version = pkg.version;

	const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
	const changelog = await readFile(changelogPath, "utf-8");
	const updated = updateChangelog(changelog, version);
	await writeFile(changelogPath, updated, "utf-8");

	run("node", ["scripts/sync-versions.js"]);
	run("git", ["add", "package.json", "package-lock.json", "CHANGELOG.md"]);
	run("git", ["commit", "-m", `Release v${version}`]);
	run("git", ["tag", `v${version}`]);

	run("npm", ["run", "prepublishOnly"]);
	run("npm", ["run", "publish:public"]);

	console.error(`Release ${version} complete.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
