import { describe, expect, it, vi } from "vitest";

import { checkForUpdates, formatUpdateNotification } from "../src/update.js";

describe("update utilities", () => {
	it("skips checks when PI_SKIP_VERSION_CHECK is set", async () => {
		const previous = process.env.PI_SKIP_VERSION_CHECK;
		process.env.PI_SKIP_VERSION_CHECK = "1";

		try {
			const fetchSpy = vi.spyOn(globalThis, "fetch");
			await expect(checkForUpdates()).resolves.toBeUndefined();
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			if (previous === undefined) {
				delete process.env.PI_SKIP_VERSION_CHECK;
			} else {
				process.env.PI_SKIP_VERSION_CHECK = previous;
			}
		}
	});

	it("returns update info when registry reports newer version", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: "99.99.99" }), { status: 200 })));
		const info = await checkForUpdates({ skipEnv: true });
		expect(info).toBeDefined();
		expect(info?.latestVersion).toBe("99.99.99");
	});

	it("formats update notifications", () => {
		const lines = formatUpdateNotification({
			packageName: "@justram/pie",
			currentVersion: "0.1.0",
			latestVersion: "0.2.0",
		});
		expect(lines[0]).toContain("@justram/pie");
		expect(lines[1]).toContain("CHANGELOG");
	});
});
