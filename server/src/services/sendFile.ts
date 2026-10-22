// Sends a stored file to the browser safely. Used for knowledge base files and unit logos.
// (The ticket file route has its own copy of this logic from step C; both behave the same.)
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import type { Response } from "express";
import { HttpError } from "../lib/http";
import { storedPath } from "./upload";

/** Builds a safe Content-Disposition header (works for names with spaces and non-English letters). */
export function contentDisposition(
  name: string,
  kind: "inline" | "attachment",
): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export interface SendOptions {
  storedName: string; // random name on disk (storedPath() refuses anything else)
  mime: string; // comes from the DATABASE (detected from the file's bytes at upload time)
  originalName: string; // only used for the download name
  download?: boolean;
  cacheSeconds?: number;
}

export async function sendStoredFile(
  res: Response,
  o: SendOptions,
): Promise<void> {
  const filePath = storedPath(o.storedName);

  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    throw new HttpError(404, "Not found"); // the database row exists but the file is gone from disk
  }

  res.setHeader("Content-Type", o.mime);
  res.setHeader("Content-Length", String(size));
  res.setHeader("X-Content-Type-Options", "nosniff"); // the browser must not guess another type
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", `private, max-age=${o.cacheSeconds ?? 60}`);
  res.setHeader(
    "Content-Disposition",
    contentDisposition(o.originalName, o.download ? "attachment" : "inline"),
  );

  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
