// Decides which files of an incoming email become ticket attachments.
// The rules are the same as for web uploads (the real type is read from the file's own bytes),
// plus two rules for email:
//   - a REAL attachment is always a candidate
//   - a picture embedded in the body (a pasted screenshot, but also a signature logo) is only
//     a candidate when it is at least 30 KB, so small logos and icons are left out
import { createHash } from "node:crypto";
import type { Attachment, ParsedMail } from "mailparser";
import { FILE_LIMITS } from "../config/constants";
import { detectFileType } from "../lib/fileType";
import type { PreparedFile } from "../services/upload";

export const MIN_INLINE_PICTURE_BYTES = 30 * 1024;

export interface PickedFiles {
  files: PreparedFile[]; // ready to be saved
  skipped: number; // wrong type, empty, too big, or over the limit of 10
  ignoredSmall: number; // small pictures embedded in the body (logos, icons)
}

/** Is this file embedded in the body of the email (instead of attached to it)? */
function isInline(a: Attachment): boolean {
  if (a.contentDisposition === "inline") return true;
  if (a.contentDisposition === "attachment") return false;
  return a.related === true || !!a.cid;
}

/** A safe name to SHOW (it is never used as a path; the file is stored under a random name). */
function safeName(raw: string | undefined, ext: string, n: number): string {
  let name = (raw ?? "").replace(/\\/g, "/").split("/").pop() ?? ""; // drop any folder part
  name = name.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, "_").trim();
  if (!name || name === "." || name === "..")
    name = `email-attachment-${n}.${ext}`;
  return name.slice(0, 255);
}

export function pickMailFiles(mail: ParsedMail): PickedFiles {
  const files: PreparedFile[] = [];
  const seen = new Set<string>(); // the same picture attached twice is saved once
  let skipped = 0;
  let ignoredSmall = 0;

  for (const a of mail.attachments ?? []) {
    const buf = a.content;
    if (
      !Buffer.isBuffer(buf) ||
      buf.length === 0 ||
      buf.length > FILE_LIMITS.maxFileBytes
    ) {
      skipped++;
      continue;
    }

    // The REAL type, from the first bytes. The file name and the type the sender claims are ignored.
    const kind = detectFileType(buf);
    if (!kind) {
      skipped++;
      continue;
    }

    // Small pictures embedded in the body are almost always signature logos or icons
    if (
      isInline(a) &&
      kind.mime !== "application/pdf" &&
      buf.length < MIN_INLINE_PICTURE_BYTES
    ) {
      ignoredSmall++;
      continue;
    }

    const hash = createHash("sha256").update(buf).digest("hex");
    if (seen.has(hash)) continue;
    seen.add(hash);

    if (files.length >= FILE_LIMITS.maxFilesPerItem) {
      skipped++;
      continue;
    }
    files.push({
      buffer: buf,
      originalName: safeName(a.filename, kind.ext, files.length + 1),
      kind,
      size: buf.length,
    });
  }

  return { files, skipped, ignoredSmall };
}
