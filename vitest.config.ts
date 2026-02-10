import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts", "test/**/*.prop.ts"],
		exclude: ["test/**/*.e2e.ts"],
		setupFiles: ["test/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov", "json-summary"],
			reportsDirectory: "coverage",
			exclude: ["**/*.d.ts", "dist/**", "examples/**", "scripts/**", "test/**"],
			thresholds: {
				lines: 40,
				functions: 45,
				branches: 35,
				statements: 40,
			},
		},
	},
});
