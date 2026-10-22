// Turns a Ctrl+V on a text box into files, when the clipboard holds a picture (for example a screenshot).
// These are only conveniences; the SERVER checks the real type of every file again.
import type { ClipboardEvent } from "react";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 20261016-153012 */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * The files on the clipboard, or an empty list when this is a normal TEXT paste.
 * Word and Excel put a picture on the clipboard next to the text; if there is any text,
 * we leave the paste alone so the text pastes as usual.
 */
export function filesFromPaste(e: ClipboardEvent<HTMLElement>): File[] {
  const data = e.clipboardData;
  if (!data) return [];
  if (data.getData("text/plain") !== "") return [];

  const found: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) found.push(f);
  }
  if (found.length === 0) return [];

  const time = stamp();
  return found.map((f, i) => {
    // Screenshots arrive as "image.png" (or with no name): give them a useful one
    const generic = !f.name || /^image\.\w+$/i.test(f.name);
    if (!generic) return f;
    const ext = EXT[f.type] ?? "png";
    const suffix = found.length > 1 ? `-${i + 1}` : "";
    return new File([f], `screenshot-${time}${suffix}.${ext}`, {
      type: f.type,
    });
  });
}
