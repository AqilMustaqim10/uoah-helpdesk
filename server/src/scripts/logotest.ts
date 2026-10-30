// Checks the logo safety checks and the PDF header without a database. Run:  npx tsx src/scripts/logotest.ts
// It builds small test pictures, builds report PDFs with and without a logo, and saves two sample PDFs so you can look at them.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { jpegLooksSane, pngIsSafe } from "../lib/logoCheck";
import { buildTicketReportPdf, type ReportInput } from "../services/pdfReport";

// ---------- a tiny PNG writer (real CRCs, random pixels so the picture does not compress away) ----------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

interface PngOptions {
  colorType?: 2 | 3 | 6; // 2 = RGB, 6 = RGBA (transparent), 3 = palette (we write no palette on purpose)
  corrupt?: boolean; // damage the picture data
  dropEnd?: boolean; // leave out the final IEND chunk
}
function makePng(w: number, h: number, o: PngOptions = {}): Buffer {
  const colorType = o.colorType ?? 2;
  const channels = colorType === 6 ? 4 : colorType === 3 ? 1 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = colorType;

  const rowBytes = 1 + w * channels;
  const raw = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++)
    crypto.randomBytes(w * channels).copy(raw, y * rowBytes + 1); // filter byte stays 0

  let idat = zlib.deflateSync(raw);
  if (o.corrupt) {
    idat = Buffer.from(idat);
    idat[Math.floor(idat.length / 2)] ^= 0xff; // the checksum inside the data makes this detectable
  }
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    ...(o.dropEnd ? [] : [chunk("IEND", Buffer.alloc(0))]),
  ]);
}

/** SOI + a frame header (marker C0, C2, ...) + a scan header + EOI. Enough for the header check. */
function makeJpeg(marker: number, w: number, h: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    marker,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xda,
    0x00,
    0x08,
    1,
    1,
    0,
    0,
    0x3f,
    0,
    0xff,
    0xd9,
  ]);
}

// ---------- 1) the PNG check ----------
const good = makePng(120, 40);
assert.equal(pngIsSafe(good), true); // a normal RGB logo
assert.equal(pngIsSafe(makePng(120, 40, { colorType: 6 })), true); // a transparent logo
assert.equal(pngIsSafe(good.subarray(0, good.length - 25)), false); // cut off
assert.equal(pngIsSafe(makePng(120, 40, { corrupt: true })), false); // damaged picture data
assert.equal(pngIsSafe(makePng(120, 40, { dropEnd: true })), false); // no end chunk
assert.equal(pngIsSafe(makePng(5000, 10)), false); // far too wide
assert.equal(pngIsSafe(makePng(120, 40, { colorType: 3 })), false); // a palette picture without a palette
assert.equal(
  pngIsSafe(
    Buffer.from(
      "this is plain text pretending to be a picture, long enough to pass the size check",
    ),
  ),
  false,
);
assert.equal(pngIsSafe(Buffer.alloc(0)), false);

// ---------- 2) the JPEG check ----------
assert.equal(jpegLooksSane(makeJpeg(0xc0, 300, 100)), true); // baseline
assert.equal(jpegLooksSane(makeJpeg(0xc2, 300, 100)), true); // progressive
assert.equal(jpegLooksSane(makeJpeg(0xc3, 300, 100)), false); // lossless: not supported
assert.equal(jpegLooksSane(makeJpeg(0xc0, 0, 100)), false); // no width
assert.equal(jpegLooksSane(makeJpeg(0xc0, 5000, 100)), false); // too wide
assert.equal(jpegLooksSane(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), false); // no frame header at all
assert.equal(jpegLooksSane(Buffer.from("not a jpeg")), false);

// ---------- 3) building PDFs ----------
const base: ReportInput = {
  generatedBy: "Test User (ADMIN)",
  generatedAt: new Date(),
  timeZone: "Asia/Kuala_Lumpur",
  scope: "Convention Centre & Events Corp (CCEC)",
  subtitle: "Report for: Convention Centre & Events Corp (CCEC) - October 2026",
  periodLine: "Tickets created 1 Oct 2026 to 31 Oct 2026",
  filters: [],
  total: 3,
  rows: [1, 2, 3].map((n) => ({
    id: n,
    title: `Test ticket ${n}`,
    status: "OPEN",
    priority: "MEDIUM",
    unit_code: "CCEC",
    requester_name: "Siti Aminah",
    assignee_name: null,
    created_at: new Date(),
    due_at: null,
    is_overdue: false,
  })),
};

async function main() {
  const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

  const noLogo = await buildTicketReportPdf(base);
  assert.ok(isPdf(noLogo));

  const badge = await buildTicketReportPdf({
    ...base,
    logo: { image: null, badgeText: "CCEC", badgeColor: "#0F766E" },
  });
  assert.ok(isPdf(badge));

  const withPng = await buildTicketReportPdf({
    ...base,
    logo: {
      image: makePng(300, 100),
      badgeText: "CCEC",
      badgeColor: "#0F766E",
    },
  });
  assert.ok(isPdf(withPng));
  assert.ok(
    withPng.length > badge.length + 5000,
    "the picture should be inside the PDF",
  );

  const withAlpha = await buildTicketReportPdf({
    ...base,
    logo: {
      image: makePng(300, 100, { colorType: 6 }),
      badgeText: "CCEC",
      badgeColor: "#0F766E",
    },
  });
  assert.ok(isPdf(withAlpha));
  assert.ok(
    withAlpha.length > badge.length + 5000,
    "the transparent picture should be inside the PDF",
  );

  // Bytes that are not a picture at all: the badge is drawn and the PDF is still produced
  const garbage = await buildTicketReportPdf({
    ...base,
    logo: {
      image: Buffer.from("definitely not a picture"),
      badgeText: "CCEC",
      badgeColor: "#0F766E",
    },
  });
  assert.ok(isPdf(garbage));
  assert.ok(
    garbage.length < withPng.length,
    "garbage must fall back to the badge",
  );

  // A broken badge color falls back to the neutral one
  assert.ok(
    isPdf(
      await buildTicketReportPdf({
        ...base,
        logo: { image: null, badgeText: "HOTEL", badgeColor: "not-a-color" },
      }),
    ),
  );

  const dir = os.tmpdir();
  const a = path.join(dir, "helpdesk-logo-sample-with-logo.pdf");
  const b = path.join(dir, "helpdesk-logo-sample-badge.pdf");
  fs.writeFileSync(a, withPng);
  fs.writeFileSync(b, badge);

  console.log("logotest.ts: all checks passed");
  console.log(
    `\nSample reports (open them to look at the header):\n  ${a}   (a random-noise "logo")\n  ${b}   (the badge)`,
  );
}

main().catch((err: Error) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
