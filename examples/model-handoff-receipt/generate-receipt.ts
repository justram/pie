// Receipt image generation utilities
//
// Generates a challenging/noisy receipt PNG for OCR testing.

import { deflateSync } from "node:zlib";

// -----------------------------
// Minimal PNG encoder (RGBA)
// -----------------------------
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

// -----------------------------
// Tiny 5x7 bitmap font
// -----------------------------
type Glyph = [string, string, string, string, string, string, string];

const FONT: Record<string, Glyph> = {
	" ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
	"#": ["01010", "11111", "01010", "11111", "01010", "00000", "00000"],
	"-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
	".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
	":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
	"/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
	"0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
	"1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
	"2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
	"3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
	"4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
	"5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
	"6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
	"7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
	"8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
	"9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
	A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
	B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
	C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
	D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
	E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
	F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
	G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
	H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
	I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
	K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
	L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
	M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
	N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
	O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
	P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
	Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
	R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
	S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
	T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
	U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
	V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
	W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
	X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
	Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
	Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function setPixel(rgba: Buffer, width: number, x: number, y: number, color: [number, number, number]): void {
	if (x < 0 || y < 0) {
		return;
	}
	if (x >= width) {
		return;
	}
	const idx = (y * width + x) * 4;
	rgba[idx + 0] = color[0];
	rgba[idx + 1] = color[1];
	rgba[idx + 2] = color[2];
	rgba[idx + 3] = 255;
}

function drawText(options: {
	rgba: Buffer;
	width: number;
	height: number;
	x: number;
	y: number;
	text: string;
	scale: number;
	color: [number, number, number];
}): void {
	const { rgba, width, height, x, y, text, scale, color } = options;
	let cursorX = x;
	for (const rawCh of text) {
		const ch = rawCh.toUpperCase();
		const glyph = FONT[ch] ?? FONT[" "];
		for (let gy = 0; gy < 7; gy++) {
			const row = glyph[gy];
			for (let gx = 0; gx < 5; gx++) {
				if (row[gx] === "1") {
					for (let sy = 0; sy < scale; sy++) {
						for (let sx = 0; sx < scale; sx++) {
							const px = cursorX + gx * scale + sx;
							const py = y + gy * scale + sy;
							if (py >= 0 && py < height) {
								setPixel(rgba, width, px, py, color);
							}
						}
					}
				}
			}
		}
		cursorX += (5 + 1) * scale; // 1px space
	}
}

function fill(rgba: Buffer, color: [number, number, number]): void {
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 0] = color[0];
		rgba[i + 1] = color[1];
		rgba[i + 2] = color[2];
		rgba[i + 3] = 255;
	}
}

// -----------------------------
// Image effects (noise / rotate / stamp)
// -----------------------------
function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let x = Math.imul(t ^ (t >>> 15), t | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

function blendPixel(
	rgba: Buffer,
	width: number,
	x: number,
	y: number,
	color: [number, number, number],
	alpha: number,
): void {
	if (x < 0 || y < 0) {
		return;
	}
	if (x >= width) {
		return;
	}
	const idx = (y * width + x) * 4;
	const a = Math.max(0, Math.min(1, alpha));
	rgba[idx + 0] = Math.round(rgba[idx + 0] * (1 - a) + color[0] * a);
	rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - a) + color[1] * a);
	rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - a) + color[2] * a);
	rgba[idx + 3] = 255;
}

function applySpeckleNoise(options: {
	rgba: Buffer;
	width: number;
	height: number;
	seed: number;
	probability: number;
	strength: number;
}): void {
	const { rgba, width, height, seed, probability, strength } = options;
	const rand = mulberry32(seed);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (rand() > probability) {
				continue;
			}
			const idx = (y * width + x) * 4;
			// Add small grayscale speckle (positive or negative).
			const delta = Math.round((rand() * 2 - 1) * strength);
			for (let c = 0; c < 3; c++) {
				const next = rgba[idx + c] + delta;
				rgba[idx + c] = Math.max(0, Math.min(255, next));
			}
		}
	}
}

function rotateRgbaNearest(options: {
	rgba: Buffer;
	width: number;
	height: number;
	angleDegrees: number;
	background: [number, number, number];
}): Buffer {
	const { rgba, width, height, angleDegrees, background } = options;
	const out = Buffer.alloc(width * height * 4);
	fill(out, background);

	const angle = (angleDegrees * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const cx = (width - 1) / 2;
	const cy = (height - 1) / 2;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Inverse mapping: find source coordinate.
			const dx = x - cx;
			const dy = y - cy;
			const sx = Math.round(cx + dx * cos + dy * sin);
			const sy = Math.round(cy - dx * sin + dy * cos);
			if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
				continue;
			}
			const src = (sy * width + sx) * 4;
			const dst = (y * width + x) * 4;
			out[dst + 0] = rgba[src + 0];
			out[dst + 1] = rgba[src + 1];
			out[dst + 2] = rgba[src + 2];
			out[dst + 3] = 255;
		}
	}

	return out;
}

function drawBorder(options: {
	rgba: Buffer;
	width: number;
	height: number;
	color: [number, number, number];
	margin: number;
}): void {
	const { rgba, width, height, color, margin } = options;
	for (let x = margin; x < width - margin; x++) {
		setPixel(rgba, width, x, margin, color);
		setPixel(rgba, width, x, height - margin - 1, color);
	}
	for (let y = margin; y < height - margin; y++) {
		setPixel(rgba, width, margin, y, color);
		setPixel(rgba, width, width - margin - 1, y, color);
	}
}

function addPaidStamp(options: { rgba: Buffer; width: number; height: number; seed: number }): void {
	const { rgba, width, height, seed } = options;
	const rand = mulberry32(seed);
	const red: [number, number, number] = [180, 20, 40];

	// Diagonal translucent bands + a big PAID text.
	const bands = 5;
	for (let b = 0; b < bands; b++) {
		const offset = Math.round((b - 2) * 22 + (rand() - 0.5) * 6);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// Line: y = x * slope + offset
				const slope = 0.35;
				const d = Math.abs(y - (x * slope + height * 0.35 + offset));
				if (d < 1.8) {
					blendPixel(rgba, width, x, y, red, 0.35);
				}
			}
		}
	}

	drawText({
		rgba,
		width,
		height,
		x: Math.round(width * 0.18),
		y: Math.round(height * 0.66),
		text: "PAID",
		scale: 6,
		color: red,
	});
}

// -----------------------------
// Receipt data type
// -----------------------------
export interface ReceiptLineItem {
	description: string;
	quantity: number;
	unitPrice: number;
	total: number;
}

export interface ReceiptData {
	merchant: string;
	currency: string;
	orderId: string;
	date: string;
	lineItems: ReceiptLineItem[];
	subtotal: number;
	tax: number;
	total: number;
}

// -----------------------------
// Receipt image generation
// -----------------------------
export function generateReceiptPng(): { png: Buffer; expected: ReceiptData } {
	const width = 520;
	const height = 420;
	const rgba = Buffer.alloc(width * height * 4);
	fill(rgba, [250, 250, 248]); // slightly off-white

	// Dark gray (lower contrast than pure black).
	const ink: [number, number, number] = [30, 30, 30];
	const scale = 2;

	// Ground truth (used only for "expectedApprox" output).
	const expected: ReceiptData = {
		merchant: "PI CAFE",
		currency: "USD",
		orderId: "A17",
		date: "2026-01-19",
		lineItems: [
			{ description: "COFFEE", quantity: 2, unitPrice: 3.5, total: 7.0 },
			{ description: "BAGEL", quantity: 1, unitPrice: 2.25, total: 2.25 },
			{ description: "MUFFIN", quantity: 1, unitPrice: 1.99, total: 1.99 },
			{ description: "TEA", quantity: 1, unitPrice: 2.1, total: 2.1 },
		],
		tax: 0.74,
		subtotal: 13.34,
		total: 14.08,
	};

	drawBorder({ rgba, width, height, color: [210, 210, 210], margin: 10 });

	// Layout intentionally messy: spacing jitter + extra misleading lines.
	const lines: string[] = [
		"PI CAFE",
		"12 MAIN ST / SF",
		"ORDER #A17",
		"DATE 2026-01-19",
		"",
		"QTY ITEM    UNIT   TOTAL",
		"2 COFFEE   3.50   7.00",
		"1 BAGEL    2.25   2.25",
		"1 MUFFIN   1.99   1.99",
		"1 TEA      2.10   2.10",
		"",
		"SUBTOTAL  13.34",
		"STATE TAX  0.52",
		"CITY TX    0.22",
		"TAX        0.74", // correct, but we will partially occlude it
		"TOTAL DUE 14.08",
		"",
		"CASH      20.00",
		"CHANGE     5.92",
		"SUGGEST TIP 1.40",
		"THANK YOU",
	];

	const rand = mulberry32(0xa17);
	let y = 24;
	for (const line of lines) {
		const jitterX = Math.round((rand() - 0.5) * 6);
		drawText({ rgba, width, height, x: 22 + jitterX, y, text: line, scale, color: ink });
		y += 12 * scale;
	}

	// Add a stamp that makes OCR / reading harder.
	addPaidStamp({ rgba, width, height, seed: 0x1337 });

	// Slight rotation to mimic a photo.
	const rotated = rotateRgbaNearest({ rgba, width, height, angleDegrees: -1.6, background: [250, 250, 248] });

	// Speckle noise to mimic compression / sensor noise.
	applySpeckleNoise({ rgba: rotated, width, height, seed: 0x20260119, probability: 0.03, strength: 40 });

	const png = encodePngRgba({ width, height, rgba: rotated });
	return { png, expected };
}
