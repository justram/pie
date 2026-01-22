export interface FrontmatterParseResult {
	frontmatter: Record<string, unknown>;
	body: string;
}

export function parseFrontmatter(content: string): FrontmatterParseResult {
	const frontmatter: Record<string, unknown> = {};
	const normalized = content.replace(/\r\n/g, "\n");

	if (!normalized.startsWith("---")) {
		return { frontmatter, body: normalized };
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { frontmatter, body: normalized };
	}

	const frontmatterBlock = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();
	const lines = frontmatterBlock.split("\n");

	let currentKey: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const listMatch = trimmed.match(/^-\s+(.*)$/);
		if (listMatch && currentKey) {
			const existing = frontmatter[currentKey];
			if (!Array.isArray(existing)) {
				frontmatter[currentKey] = [];
			}
			(frontmatter[currentKey] as unknown[]).push(parseScalar(listMatch[1]));
			continue;
		}

		const keyMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
		if (keyMatch) {
			currentKey = keyMatch[1];
			const rawValue = keyMatch[2];

			if (rawValue.length === 0) {
				frontmatter[currentKey] = null;
			} else {
				frontmatter[currentKey] = parseScalar(rawValue);
			}
			continue;
		}

		currentKey = null;
	}

	return { frontmatter, body };
}

function parseScalar(value: string): string | number | boolean {
	let parsed = value.trim();
	if ((parsed.startsWith('"') && parsed.endsWith('"')) || (parsed.startsWith("'") && parsed.endsWith("'"))) {
		parsed = parsed.slice(1, -1);
	}

	const lower = parsed.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(parsed)) return Number(parsed);

	return parsed;
}
