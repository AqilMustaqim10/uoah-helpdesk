// Checks the email attachment rules on made-up messages. Run:  npx tsx src/scripts/mailfilestest.ts
import assert from "node:assert/strict";
import type { ParsedMail } from "mailparser";
import { pickMailFiles } from "../ingest/mailFiles";

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A "picture" of the given size (only the first bytes matter to the checker). `seed` makes files different. */
const png = (size: number, seed = 1) =>
  Buffer.concat([PNG_HEAD, Buffer.alloc(Math.max(size - 8, 8), seed)]);

interface Fake {
  filename?: string;
  contentDisposition: "attachment" | "inline";
  content: Buffer;
  cid?: string;
  related?: boolean;
}
const mailWith = (...list: Fake[]) =>
  ({
    attachments: list.map((a) => ({
      type: "attachment",
      contentType: "application/octet-stream",
      ...a,
    })),
  }) as unknown as ParsedMail;

// 1) A real attachment is kept, even a small one
let r = pickMailFiles(
  mailWith({
    filename: "photo.png",
    contentDisposition: "attachment",
    content: png(2000),
  }),
);
assert.equal(r.files.length, 1);
assert.equal(r.files[0].kind.mime, "image/png");

// 2) A small picture embedded in the body (a signature logo) is ignored
r = pickMailFiles(
  mailWith({
    filename: "image001.png",
    contentDisposition: "inline",
    cid: "a@b",
    related: true,
    content: png(5000),
  }),
);
assert.equal(r.files.length, 0);
assert.equal(r.ignoredSmall, 1);

// 3) A related footer image is ignored even when the mail client labels it as an attachment
r = pickMailFiles(
  mailWith({
    filename: "image001.png",
    contentDisposition: "attachment",
    cid: "footer@company",
    related: true,
    content: png(44 * 1024),
  }),
);
assert.equal(r.files.length, 0);
assert.equal(r.ignoredSmall, 1);

// 4) A larger picture embedded in the body (a pasted screenshot) is kept
r = pickMailFiles(
  mailWith({
    filename: "image002.png",
    contentDisposition: "inline",
    cid: "c@d",
    related: true,
    content: png(60 * 1024),
  }),
);
assert.equal(r.files.length, 1);

// 5) Our own large inline logo, carried back in a reply, is never saved again
r = pickMailFiles(
  mailWith({
    filename: "email-reply-logo.jpeg",
    contentDisposition: "attachment",
    cid: "<uoa-helpdesk-logo>",
    related: true,
    content: png(66 * 1024),
  }),
);
assert.equal(r.files.length, 0);
assert.equal(r.skipped, 0);
assert.equal(r.ignoredSmall, 0);

// 5b) Some mail clients remove the CID from a quoted inline logo. Its known
// filename still identifies it as a helpdesk template image, not a reply file.
r = pickMailFiles(
  mailWith({
    filename: "email-reply-logo.jpeg",
    contentDisposition: "attachment",
    content: png(66 * 1024),
  }),
);
assert.equal(r.files.length, 0);
assert.equal(r.skipped, 0);

// 6) A program disguised as a picture is refused
r = pickMailFiles(
  mailWith({
    filename: "evil.png",
    contentDisposition: "attachment",
    content: Buffer.from("MZ" + "x".repeat(200)),
  }),
);
assert.equal(r.files.length, 0);
assert.equal(r.skipped, 1);

// 7) Plain text named .pdf is refused, but a real PDF with a vague type is accepted as a PDF
r = pickMailFiles(
  mailWith(
    {
      filename: "fake.pdf",
      contentDisposition: "attachment",
      content: Buffer.from("just some text, not a pdf at all"),
    },
    {
      filename: "real.bin",
      contentDisposition: "attachment",
      content: Buffer.from("%PDF-1.4 " + "x".repeat(100)),
    },
  ),
);
assert.equal(r.files.length, 1);
assert.equal(r.files[0].kind.mime, "application/pdf");
assert.equal(r.skipped, 1);

// 8) The same picture twice is saved once
r = pickMailFiles(
  mailWith(
    { filename: "a.png", contentDisposition: "attachment", content: png(3000) },
    { filename: "b.png", contentDisposition: "attachment", content: png(3000) },
  ),
);
assert.equal(r.files.length, 1);

// 9) File names are cleaned (folders removed), and a missing name gets a fallback
r = pickMailFiles(
  mailWith(
    {
      filename: "../../evil.png",
      contentDisposition: "attachment",
      content: png(3000, 2),
    },
    {
      filename: "C:\\temp\\scan.png",
      contentDisposition: "attachment",
      content: png(3000, 3),
    },
    { contentDisposition: "attachment", content: png(3000, 4) },
  ),
);
assert.deepEqual(
  r.files.map((f) => f.originalName),
  ["evil.png", "scan.png", "email-attachment-3.png"],
);

// 10) At most 10 files are kept
r = pickMailFiles(
  mailWith(
    ...Array.from({ length: 12 }, (_, i) => ({
      filename: `f${i}.png`,
      contentDisposition: "attachment" as const,
      content: png(3000, i + 10),
    })),
  ),
);
assert.equal(r.files.length, 10);
assert.equal(r.skipped, 2);

// 11) No attachments at all
assert.equal(
  pickMailFiles({ attachments: [] } as unknown as ParsedMail).files.length,
  0,
);

console.log("mailfilestest.ts: all checks passed");
