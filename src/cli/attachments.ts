import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import { isImagePath, mimeTypeForImage, resizeImage } from "./image.js";

export interface AttachmentLoadResult {
	textPrefix: string;
	images: ImageContent[];
}

export function loadAttachments(paths: string[]): AttachmentLoadResult {
	const images: ImageContent[] = [];
	const blocks: string[] = [];

	for (const inputPath of paths) {
		const resolved = resolve(inputPath);
		if (isImagePath(resolved)) {
			const buffer = readFileSync(resolved);
			const mimeType = mimeTypeForImage(resolved);
			const base64 = buffer.toString("base64");
			const resized = resizeImage({ type: "image", mimeType, data: base64 });
			images.push(resized.image);
			blocks.push(renderFileBlock(resolved, "[image attached]", resized.image.mimeType));
			continue;
		}

		const content = readFileSync(resolved, "utf8");
		blocks.push(renderFileBlock(resolved, content));
	}

	return {
		textPrefix: blocks.join("\n\n"),
		images,
	};
}

export function renderFileBlock(path: string, content: string, mimeType?: string): string {
	const typeAttr = mimeType ? ` type="${mimeType}"` : "";
	return `<file name="${path}"${typeAttr}>\n${content}\n</file>`;
}
