// Everything about receiving and storing uploaded files.
//  1) multer reads the upload into memory (with size and count limits)
//  2) prepareFiles() checks every file's REAL type from its bytes
//  3) writeFiles() saves them to server/uploads under random names
// Nothing is written to disk until every file has passed the checks.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { config } from "../config/env";
import { FILE_LIMITS } from "../config/constants";
import { HttpError } from "../lib/http";
import { detectFileType, type FileKind } from "../lib/fileType";

/** Express middleware: use as  upload.array('files', 10)  on routes that accept files. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_LIMITS.maxFileBytes, // 10 MB per file
    files: FILE_LIMITS.maxFilesPerItem, // 10 files per request
    fields: 10, // few text fields (body, is_internal)
    fieldSize: 64 * 1024, // a comment is at most about 40 KB of text
    parts: 30,
  },
});

/** A file that passed the checks but is not saved yet. */
export interface PreparedFile {
  buffer: Buffer;
  originalName: string;
  kind: FileKind;
  size: number;
}

/** A file that is now saved on disk. */
export interface StoredFile extends PreparedFile {
  storedName: string;
}

// The only shape a stored name can have: 32 random hex characters + a known extension.
const STORED_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|gif|webp|pdf)$/;

/** Full path of a stored file. Throws if the name is not one we generated (blocks path tricks). */
export function storedPath(storedName: string): string {
  if (!STORED_NAME_RE.test(storedName))
    throw new Error("Invalid stored file name");
  return path.join(config.uploadDir, storedName);
}

/** Cleans the name the user's computer gave the file (only used for DISPLAY, never as a path). */
function cleanFileName(raw: string): string {
  let name = raw;

  // The upload library delivers non-English names as "latin1" text; turn it back into proper UTF-8
  if (/[^\u0000-\u007f]/.test(name) && /^[\u0000-\u00ff]*$/.test(name)) {
    const utf8 = Buffer.from(name, "latin1").toString("utf8");
    if (!utf8.includes("\uFFFD")) name = utf8;
  }

  name = name.replace(/\\/g, "/").split("/").pop() ?? ""; // drop any folder part
  name = name.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, "_").trim(); // remove odd characters
  if (!name || name === "." || name === "..") name = "file";
  return name.slice(0, 255);
}

/**
 * Checks every uploaded file. Throws 400 if any file is not an allowed type.
 * All-or-nothing: if one file is bad, nothing is saved.
 */
export function prepareFiles(
  files: Express.Multer.File[] | undefined,
): PreparedFile[] {
  const list = files ?? [];
  if (list.length > FILE_LIMITS.maxFilesPerItem) {
    throw new HttpError(
      400,
      `You can upload at most ${FILE_LIMITS.maxFilesPerItem} files at a time.`,
    );
  }

  return list.map((f) => {
    const originalName = cleanFileName(f.originalname || "file");
    const kind = detectFileType(f.buffer); // real type from the file's own bytes
    if (!kind) {
      throw new HttpError(
        400,
        `"${originalName.slice(0, 60)}" is not allowed. Only JPG, PNG, GIF, WebP and PDF files are accepted.`,
      );
    }
    return { buffer: f.buffer, originalName, kind, size: f.buffer.length };
  });
}

/** Saves the files into server/uploads with random names. On any error, removes what it already wrote. */
export async function writeFiles(
  prepared: PreparedFile[],
): Promise<StoredFile[]> {
  const written: StoredFile[] = [];
  if (prepared.length === 0) return written;

  await fs.mkdir(config.uploadDir, { recursive: true });
  try {
    for (const p of prepared) {
      const storedName = `${crypto.randomBytes(16).toString("hex")}.${p.kind.ext}`;
      // flag "wx" = fail instead of overwriting an existing file
      await fs.writeFile(storedPath(storedName), p.buffer, {
        flag: "wx",
        mode: 0o640,
      });
      written.push({ ...p, storedName });
    }
  } catch (err) {
    await removeStored(written.map((w) => w.storedName));
    throw err;
  }
  return written;
}

/** Deletes stored files from disk. Best effort: a missing file is not an error. */
export async function removeStored(storedNames: string[]): Promise<void> {
  for (const name of storedNames) {
    try {
      await fs.unlink(storedPath(name));
    } catch {
      /* already gone, or not ours: ignore */
    }
  }
}
