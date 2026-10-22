// Finds out what a file REALLY is by reading its first bytes ("magic bytes").
// We never trust the file name or the type the browser claims, because both can be faked.

export type FileMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "application/pdf";

export interface FileKind {
  mime: FileMime;
  ext: "jpg" | "png" | "gif" | "webp" | "pdf";
}

// Every PNG file starts with exactly these 8 bytes
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Returns the real type of the file, or null if it is not one of the five allowed types. */
export function detectFileType(buf: Buffer): FileKind | null {
  if (buf.length < 12) return null; // too small to be a real picture or PDF

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" };

  // PNG
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE))
    return { mime: "image/png", ext: "png" };

  // GIF: "GIF87a" or "GIF89a"
  const head6 = buf.toString("latin1", 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a")
    return { mime: "image/gif", ext: "gif" };

  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  // PDF: starts with "%PDF-"
  if (buf.toString("latin1", 0, 5) === "%PDF-")
    return { mime: "application/pdf", ext: "pdf" };

  return null; // anything else (including SVG, HTML, EXE, ...) is refused
}

/** Business unit logos (step D) may only be PNG, JPG or WebP: never GIF, PDF or SVG. */
export function isLogoType(kind: FileKind | null): kind is FileKind {
  return (
    !!kind &&
    (kind.mime === "image/png" ||
      kind.mime === "image/jpeg" ||
      kind.mime === "image/webp")
  );
}
