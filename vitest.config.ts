import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts", "test/**/*.prop.ts"],
		exclude: ["test/**/*.e2e.ts"],
		setupFiles: ["test/setup.ts"],
	},
});
