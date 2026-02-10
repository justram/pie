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
			include: [
				"src/cache/warm.ts",
				"src/core/cache/**/*.ts",
				"src/core/schema/**/*.ts",
				"src/core/validators/**/*.ts",
				"src/update.ts",
				"src/utils/**/*.ts",
			],
			exclude: ["**/*.d.ts", "src/**/types.ts", "dist/**", "examples/**", "scripts/**", "test/**"],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
