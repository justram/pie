import { readFileSync } from "node:fs";

export interface UpdateInfo {
	packageName: string;
	currentVersion: string;
	latestVersion: string;
}

function getPackageInfo(): { name: string; version: string } {
	const pkgPath = new URL("../package.json", import.meta.url);
	const raw = readFileSync(pkgPath, "utf8");
	const pkg = JSON.parse(raw) as { name?: string; version?: string };
	return {
		name: pkg.name ?? "pie",
		version: pkg.version ?? "0.0.0",
	};
}

export function getVersion(): string {
	return getPackageInfo().version;
}

export async function checkForUpdates(options: { skipEnv?: boolean } = {}): Promise<UpdateInfo | undefined> {
	if (!options.skipEnv && process.env.PI_SKIP_VERSION_CHECK) return undefined;

	const { name, version } = getPackageInfo();
	try {
		const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
		if (!response.ok) return undefined;

		const data = (await response.json()) as { version?: string };
		const latestVersion = data.version;
		if (latestVersion && latestVersion !== version) {
			return {
				packageName: name,
				currentVersion: version,
				latestVersion,
			};
		}

		return undefined;
	} catch {
		return undefined;
	}
}

export function formatUpdateNotification(info: UpdateInfo): string[] {
	return [
		`Update available for ${info.packageName}: v${info.latestVersion} (current v${info.currentVersion}). Run: npm install -g ${info.packageName}`,
		"Changelog: https://github.com/justram/pie/blob/main/CHANGELOG.md",
	];
}
