import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/cli/args.js";

describe("parseArgs", () => {
	it("parses standard flags", () => {
		const result = parseArgs([
			"-s",
			"schema.json",
			"-p",
			"Prompt",
			"-i",
			"input.txt",
			"-a",
			"context.txt",
			"-a",
			"image.png",
			"-o",
			"out.json",
			"-m",
			"claude-sonnet",
			"-t",
			"5",
			"--validate",
			"jq -e '.'",
			"--validate-url",
			"https://example.com",
			"--stream",
			"--verbose",
			"--quiet",
		]);

		expect(result.errors).toEqual([]);
		expect(result.args.schema).toBe("schema.json");
		expect(result.args.prompt).toBe("Prompt");
		expect(result.args.input).toBe("input.txt");
		expect(result.args.attachments).toEqual(["context.txt", "image.png"]);
		expect(result.args.output).toBe("out.json");
		expect(result.args.model).toBe("claude-sonnet");
		expect(result.args.maxTurns).toBe(5);
		expect(result.args.validateCommand).toBe("jq -e '.'");
		expect(result.args.validateUrl).toBe("https://example.com");
		expect(result.args.stream).toBe(true);
		expect(result.args.verbose).toBe(true);
		expect(result.args.quiet).toBe(true);
	});

	it("reports unknown flags", () => {
		const result = parseArgs(["--nope"]);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0]).toContain("Unknown option");
	});
});
