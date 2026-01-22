// Example: image extraction with pie (vision-capable model required)
//
// This mirrors Instructor's vision example, but uses pie.
//
// Run (from repo root):
//   npm run build
//   npx tsx examples/vision-circle/run.ts
//
// Or choose provider/model explicitly:
//   npx tsx examples/vision-circle/run.ts google-antigravity gemini-3-flash
//   npx tsx examples/vision-circle/run.ts openai-codex gpt-5.2-codex

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { extractSync, type Static, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

/**
 * Minimal PNG encoder for RGBA pixels (color type 6).
 * Avoids external dependencies so the example is self-contained.
 */
function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i] as number;
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const typeBuf = Buffer.from(type, "ascii");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);

	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);

	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(options: { width: number; height: number; rgba: Buffer }): Buffer {
	const { width, height, rgba } = options;
	if (rgba.length !== width * height * 4) {
		throw new Error(`Invalid RGBA buffer length: got ${rgba.length}, expected ${width * height * 4}`);
	}

	// Each scanline: 1 filter byte + RGBA pixels
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0; // filter: None
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}

	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	const idat = deflateSync(raw, { level: 9 });

	return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function drawCircleImage(options: {
	width: number;
	height: number;
	cx: number;
	cy: number;
	r: number;
	color: [number, number, number];
}): Buffer {
	const { width, height, cx, cy, r, color } = options;
	const rgba = Buffer.alloc(width * height * 4);

	// Fill white background
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 0] = 255;
		rgba[i + 1] = 255;
		rgba[i + 2] = 255;
		rgba[i + 3] = 255;
	}

	const [cr, cg, cb] = color;
	const r2 = r * r;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dx = x - cx;
			const dy = y - cy;
			if (dx * dx + dy * dy <= r2) {
				const idx = (y * width + x) * 4;
				rgba[idx + 0] = cr;
				rgba[idx + 1] = cg;
				rgba[idx + 2] = cb;
				rgba[idx + 3] = 255;
			}
		}
	}

	return rgba;
}

const COLORS: Record<string, [number, number, number]> = {
	red: [220, 20, 60],
	green: [34, 139, 34],
	blue: [65, 105, 225],
	black: [0, 0, 0],
};

const width = 256;
const height = 256;
const cx = 160;
const cy = 96;
const r = 60;
const colorName = "red" as const;

const schema = Type.Object({
	x: Type.Integer({ minimum: 0, maximum: width - 1 }),
	y: Type.Integer({ minimum: 0, maximum: height - 1 }),
	color: Type.Union([Type.Literal("red"), Type.Literal("green"), Type.Literal("blue"), Type.Literal("black")]),
});

type ExtractionResult = Static<typeof schema>;

type SupportedProvider = "openai-codex" | "google-antigravity";

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);

	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const defaultModelId = provider === "openai-codex" ? "gpt-5.2-codex" : "gemini-3-flash";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((candidate) => candidate.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}
	if (!model.input.includes("image")) {
		throw new Error(`Model does not support image input: ${provider}:${modelId}`);
	}

	console.error(`Using model: ${provider}:${modelId}`);
	console.error("Generating image...");

	const rgba = drawCircleImage({ width, height, cx, cy, r, color: COLORS[colorName] });
	const png = encodePngRgba({ width, height, rgba });

	const imgPath = resolve("examples/vision-circle/circle.png");
	writeFileSync(imgPath, png);

	const imageBase64 = readFileSync(imgPath).toString("base64");
	const apiKey = await ensureOAuthApiKey(provider);

	console.error("Starting extraction...");
	const result: ExtractionResult = await extractSync(
		"The image contains a single filled circle on a white background.",
		{
			schema,
			prompt: [
				"Extract the circle center coordinates and the circle color.",
				`The image size is ${width}x${height}. Coordinates are pixel indices with (0,0) at the top-left.`,
				"Return integers for x/y and one of: red, green, blue, black.",
				"If you are unsure about exact coordinates, provide the best estimate.",
			].join("\n"),
			model,
			apiKey,
			attachments: [
				{
					type: "image",
					mimeType: "image/png",
					data: imageBase64,
				},
			],
		},
	);
	console.error("Extraction complete.");

	console.log("Expected (approx):", { x: cx, y: cy, color: colorName });
	console.log("Extracted:", result);
	console.error(`Wrote image to: ${imgPath}`);
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
