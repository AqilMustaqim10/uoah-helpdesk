// Checks that a logo picture is safe to hand to the PDF library.
// Why: the library decodes PNG pictures in a background step whose errors cannot be caught, so a damaged PNG could
// crash the whole API. Here the PNG is fully unpacked (inside a try/catch) BEFORE the library sees it.
// Anything unusual (odd formats, huge sizes, damaged files) simply returns false, and the report shows a badge instead.
// This file needs no database and no .env, so it can be tested on its own (scripts/logotest.ts).
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_SIDE = 4000; // no logo is wider or taller than this many pixels
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024; // and its raw pixels never need more than 64 MB (stops "zip bombs")

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
// Allowed bit depths per PNG color type. Types with an alpha channel (4 and 6) and color (2) must be 8-bit.
const DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8],
  2: [8],
  3: [1, 2, 4, 8],
  4: [8],
  6: [8],
};

/** true = this PNG is complete, well formed, and safe to give to the PDF library. */
export function pngIsSafe(buf: Buffer): boolean {
  try {
    if (buf.length < 45 || !buf.subarray(0, 8).equals(PNG_SIGNATURE))
      return false;

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    let interlace = 0;
    let sawHeader = false;
    let sawPalette = false;
    let sawEnd = false;
    const idat: Buffer[] = [];

    // Walk through the chunks: [length 4][type 4][data][crc 4]
    while (offset + 12 <= buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.toString("latin1", offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > buf.length) return false; // a chunk runs past the end of the file: truncated
      const data = buf.subarray(dataStart, dataEnd);

      if (type === "IHDR") {
        if (sawHeader || length !== 13) return false;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        if (data[10] !== 0 || data[11] !== 0) return false; // compression and filter method must be 0
        interlace = data[12];
        sawHeader = true;
      } else if (!sawHeader) {
        return false; // the header must come first
      } else if (type === "PLTE") {
        sawPalette = true;
      } else if (type === "IDAT") {
        idat.push(data);
      } else if (type === "IEND") {
        sawEnd = true;
        break;
      }
      offset = dataEnd + 4;
    }

    if (!sawHeader || !sawEnd || idat.length === 0) return false;
    if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE)
      return false;
    if (interlace !== 0 && interlace !== 1) return false;
    if (!DEPTHS[colorType]?.includes(bitDepth)) return false; // also rejects unknown color types
    if (colorType === 3 && !sawPalette) return false;

    // The real test: unpack all the picture data. A damaged file throws here, where we can catch it.
    const raw = zlib.inflateSync(Buffer.concat(idat), {
      maxOutputLength: MAX_UNPACKED_BYTES,
    });
    if (raw.length === 0) return false;
    if (interlace === 0) {
      const rowBytes =
        1 + Math.ceil((width * CHANNELS[colorType] * bitDepth) / 8);
      if (raw.length < rowBytes * height) return false; // not enough picture data for the size in the header
    }
    return true;
  } catch {
    return false;
  }
}

/** true = this JPEG has a normal frame header (baseline, extended or progressive) with a sensible size. */
export function jpegLooksSane(buf: Buffer): boolean {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;

    let off = 2;
    while (off + 4 <= buf.length) {
      if (buf[off] !== 0xff) return false;
      const marker = buf[off + 1];
      if (marker === 0xff) {
        off++; // padding byte
        continue;
      }
      // markers that have no body
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        off += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return false; // the end, or picture data, before any frame header

      const segmentLength = buf.readUInt16BE(off + 2);
      if (segmentLength < 2) return false;

      // The frame header: C0 baseline, C1 extended sequential, C2 progressive
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (off + 10 > buf.length) return false;
        const height = buf.readUInt16BE(off + 5);
        const width = buf.readUInt16BE(off + 7);
        const components = buf[off + 9];
        return (
          width >= 1 &&
          height >= 1 &&
          width <= MAX_SIDE &&
          height <= MAX_SIDE &&
          (components === 1 || components === 3 || components === 4)
        );
      }
      off += 2 + segmentLength;
    }
    return false;
  } catch {
    return false;
  }
}
