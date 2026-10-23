// The building blocks of the nightly backup: backup folder names, keeping the newest ones,
// and copying the uploads folder in a space-saving way.
// This file needs no database and no .env, so it can be tested on its own (scripts/backuptest.ts).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** A finished backup folder looks like helpdesk-2026-10-21_0200 (date, then hour and minute). */
export const BACKUP_NAME_RE =
  /^helpdesk-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/;
const PARTIAL_RE = /^helpdesk-\d{4}-\d{2}-\d{2}_\d{4}\.partial$/;

export function backupName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `helpdesk-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** The moment written in a backup folder's name, or null when the name is not a backup name. */
export function backupDate(name: string): Date | null {
  const m = BACKUP_NAME_RE.exec(name);
  return m
    ? new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
      )
    : null;
}

/** Finished backups, newest first. Only folders with a proper backup name are listed. */
export function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && BACKUP_NAME_RE.test(e.name))
    .map((e) => e.name)
    .sort() // these names sort in time order
    .reverse();
}

/**
 * Removes backups older than keepDays, but ALWAYS keeps the newest keepAtLeast ones.
 * Only folders with a backup name are ever touched; anything else in the folder is left alone.
 * Returns the names that were removed.
 */
export function pruneBackups(
  dir: string,
  keepDays: number,
  keepAtLeast: number,
  now: Date,
): string[] {
  const cutoff = now.getTime() - keepDays * 86_400_000;
  const removed: string[] = [];
  listBackups(dir).forEach((name, index) => {
    if (index < keepAtLeast) return;
    const when = backupDate(name);
    if (!when || when.getTime() >= cutoff) return;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    removed.push(name);
  });
  return removed;
}

/** Deletes unfinished backups left behind by a crash (folders ending in .partial). */
export function removePartials(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && PARTIAL_RE.test(e.name))
      fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
}

/** The SHA-256 fingerprint of a file, for the backup's manifest. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export interface MirrorResult {
  files: number;
  bytes: number;
  linked: number; // unchanged files that share their data with the previous backup (no extra space)
  copied: number;
}

/**
 * Copies a folder. When `prev` (the previous backup of the same folder) holds a file with the same name and size,
 * a hard link to it is made instead of a copy. Uploaded files get random names and never change, so a same-named,
 * same-sized file is the same file. If links are not possible (another disk), the file is simply copied.
 */
export function mirrorFolder(
  src: string,
  dest: string,
  prev: string | null,
): MirrorResult {
  const result: MirrorResult = { files: 0, bytes: 0, linked: 0, copied: 0 };
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(src)) return result;

  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(src, rel), {
      withFileTypes: true,
    })) {
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(path.join(dest, relPath), { recursive: true });
        walk(relPath);
        continue;
      }
      if (!entry.isFile()) continue; // shortcuts and other special items are not followed

      const from = path.join(src, relPath);
      const to = path.join(dest, relPath);
      const size = fs.statSync(from).size;

      let done = false;
      if (prev) {
        try {
          const before = path.join(prev, relPath);
          if (fs.statSync(before).size === size) {
            fs.linkSync(before, to);
            result.linked++;
            done = true;
          }
        } catch {
          /* not in the previous backup, or links are not possible here: copy it below */
        }
      }
      if (!done) {
        fs.copyFileSync(from, to);
        result.copied++;
      }
      result.files++;
      result.bytes += size;
    }
  };
  walk("");
  return result;
}

/** 1536 -> "1.5 KB" */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
