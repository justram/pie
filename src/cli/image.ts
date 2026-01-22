import type { ImageContent } from "@mariozechner/pi-ai";
import * as photon from "@silvia-odwyer/photon-node";

export interface ImageResizeOptions {
	maxWidth?: number;
	maxHeight?: number;
	jpegQuality?: number;
}

export interface ResizedImage {
	image: ImageContent;
	originalWidth: number;
	originalHeight: number;
	width: number;
	height: number;
	wasResized: boolean;
}

const DEFAULT_OPTIONS: Required<ImageResizeOptions> = {
	maxWidth: 2000,
	maxHeight: 2000,
	jpegQuality: 85,
};

export function resizeImage(image: ImageContent, options: ImageResizeOptions = {}): ResizedImage {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const buffer = Buffer.from(image.data, "base64");
	let decoded: photon.PhotonImage | undefined;

	try {
		decoded = photon.PhotonImage.new_from_byteslice(new Uint8Array(buffer));
		const originalWidth = decoded.get_width();
		const originalHeight = decoded.get_height();

		if (originalWidth <= opts.maxWidth && originalHeight <= opts.maxHeight) {
			return {
				image,
				originalWidth,
				originalHeight,
				width: originalWidth,
				height: originalHeight,
				wasResized: false,
			};
		}

		const { width, height } = clampDimensions(originalWidth, originalHeight, opts.maxWidth, opts.maxHeight);
		const resized = photon.resize(decoded, width, height, photon.SamplingFilter.Lanczos3);
		try {
			const mimeType = image.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
			const bytes = mimeType === "image/jpeg" ? resized.get_bytes_jpeg(opts.jpegQuality) : resized.get_bytes();
			const data = Buffer.from(bytes).toString("base64");
			return {
				image: { type: "image", mimeType, data },
				originalWidth,
				originalHeight,
				width,
				height,
				wasResized: true,
			};
		} finally {
			resized.free();
		}
	} finally {
		decoded?.free();
	}
}

export function isImagePath(path: string): boolean {
	return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

export function mimeTypeForImage(path: string): string {
	const lower = path.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".webp")) return "image/webp";
	return "image/png";
}

function clampDimensions(
	width: number,
	height: number,
	maxWidth: number,
	maxHeight: number,
): { width: number; height: number } {
	let nextWidth = width;
	let nextHeight = height;

	if (nextWidth > maxWidth) {
		nextHeight = Math.round((nextHeight * maxWidth) / nextWidth);
		nextWidth = maxWidth;
	}
	if (nextHeight > maxHeight) {
		nextWidth = Math.round((nextWidth * maxHeight) / nextHeight);
		nextHeight = maxHeight;
	}

	return { width: Math.max(1, nextWidth), height: Math.max(1, nextHeight) };
}
