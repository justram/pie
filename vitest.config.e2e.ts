import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.e2e.ts"],
		exclude: [],
		setupFiles: ["test/setup.ts"],
	},
});
