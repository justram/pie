import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadExtractionSetup } from "../src/core/setup.js";

function createTempDir(): string {
	const base = tmpdir();
	const dir = join(base, `pi-extract-setup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe("loadExtractionSetup", () => {
	it("renders template when enabled", () => {
		const dir = createTempDir();
		const schemaPath = join(dir, "schema.json");
		const setupPath = join(dir, "setup.md");

		writeFileSync(schemaPath, JSON.stringify({ type: "object", properties: { name: { type: "string" } } }));
		writeFileSync(
			setupPath,
			[
				"---",
				`schema: ${schemaPath}`,
				"model: openai-codex/gpt-5.2",
				"template: true",
				"---",
				"Hello {{ name }}",
			].join("\n"),
		);

		const setup = loadExtractionSetup(setupPath, { vars: { name: "World" } });
		expect(setup.prompt).toBe("Hello World");
		expect(setup.options.prompt).toBe("Hello World");
	});

	it("leaves template untouched when disabled", () => {
		const dir = createTempDir();
		const schemaPath = join(dir, "schema.json");
		const setupPath = join(dir, "setup.md");

		writeFileSync(schemaPath, JSON.stringify({ type: "object", properties: { name: { type: "string" } } }));
		writeFileSync(
			setupPath,
			[
				"---",
				`schema: ${schemaPath}`,
				"model: openai-codex/gpt-5.2",
				"template: false",
				"---",
				"Hello {{ name }}",
			].join("\n"),
		);

		const setup = loadExtractionSetup(setupPath, { vars: { name: "World" } });
		expect(setup.prompt).toBe("Hello {{ name }}");
	});
});
