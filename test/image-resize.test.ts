import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { resizeImage } from "../src/cli/image.js";

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

function encodePngRgba(width: number, height: number, rgba: Buffer): Buffer {
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}

	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const idat = deflateSync(raw, { level: 9 });

	return Buffer.concat([
		signature,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", idat),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

describe("resizeImage", () => {
	it("shrinks images beyond max dimensions", () => {
		const width = 2;
		const height = 2;
		const rgba = Buffer.alloc(width * height * 4, 255);
		const png = encodePngRgba(width, height, rgba);
		const data = png.toString("base64");

		const result = resizeImage({ type: "image", mimeType: "image/png", data }, { maxWidth: 1, maxHeight: 1 });

		expect(result.wasResized).toBe(true);
		expect(result.width).toBeLessThanOrEqual(1);
		expect(result.height).toBeLessThanOrEqual(1);
		expect(result.image.data.length).toBeGreaterThan(0);
	});
});
