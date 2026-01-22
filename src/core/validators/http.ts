import { HttpValidationError } from "../errors.js";

async function readErrorBody(response: Response): Promise<string> {
	const text = await response.text();
	if (!text) {
		return "";
	}

	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		const msg = typeof json.error === "string" ? json.error : typeof json.message === "string" ? json.message : null;
		return msg ?? text;
	} catch {
		return text;
	}
}

export async function runHttpValidator(data: unknown, url: string, signal?: AbortSignal): Promise<void> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
		signal,
	});

	if (response.ok) {
		return;
	}

	const message = (await readErrorBody(response)) || `Validator returned ${response.status}`;
	throw new HttpValidationError(message, url, response.status);
}
