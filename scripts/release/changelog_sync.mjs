import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const cliffConfigPath = path.join(rootDir, "cliff.toml");

function fail(message) {
	throw new Error(message);
}

function runGitCliff() {
	const hasGitCliff = spawnSync("git-cliff", ["--version"], { stdio: "ignore" });
	if (hasGitCliff.status !== 0) {
		fail("git-cliff is not installed. Install it (e.g. `brew install git-cliff`) and retry.");
	}

	const result = spawnSync(
		"git-cliff",
		["--config", cliffConfigPath, "--unreleased", "--strip", "all"],
		{ encoding: "utf-8" },
	);

	if (result.status !== 0) {
		const stderr = (result.stderr ?? "").toString().trim();
		fail(`git-cliff failed (${result.status}): ${stderr || "no stderr output"}`);
	}

	return (result.stdout ?? "").toString().trim();
}

function replaceUnreleasedSection(changelogText, generatedBody) {
	const marker = "## [Unreleased]";
	const start = changelogText.indexOf(marker);
	if (start < 0) {
		fail("CHANGELOG.md must contain a '## [Unreleased]' section");
	}

	const markerEnd = start + marker.length;
	const rest = changelogText.slice(markerEnd);
	const nextRelease = rest.search(/\n## /);
	const end = nextRelease >= 0 ? markerEnd + nextRelease : changelogText.length;

	const body = generatedBody === "<!-- no entries -->" ? "" : generatedBody;
	const replacement = body ? `${marker}\n\n${body}\n\n` : `${marker}\n\n`;
	return changelogText.slice(0, start) + replacement + changelogText.slice(end);
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");

	const generated = runGitCliff();
	if (dryRun) {
		console.log(generated);
		return;
	}

	const current = await readFile(changelogPath, "utf-8");
	const updated = replaceUnreleasedSection(current, generated);
	await writeFile(changelogPath, updated, "utf-8");

	console.log("Updated CHANGELOG.md [Unreleased] from git-cliff.");
	console.log("Next steps:");
	console.log("1) Review CHANGELOG.md");
	console.log("2) git add CHANGELOG.md");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
