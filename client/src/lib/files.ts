// Helpers for choosing files in the browser.
// These checks only give friendly, instant feedback. The SERVER re-checks every file
// by reading its real contents, so these can never be the only protection.

export const ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf";
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 10;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

export const isImage = (mime: string): boolean => mime.startsWith("image/");

/** 1536 -> "2 KB", 3145728 -> "3.0 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Splits chosen files into the ones we accept and a list of friendly problems.
 * alreadyHave = how many files are already attached / waiting (the limit is 10 in total).
 */
export function pickValidFiles(
  candidates: File[],
  alreadyHave: number,
): { accepted: File[]; problems: string[] } {
  const accepted: File[] = [];
  const problems: string[] = [];

  for (const f of candidates) {
    if (!ALLOWED.has(f.type)) {
      problems.push(
        `${f.name}: only JPG, PNG, GIF, WebP and PDF files are allowed.`,
      );
      continue;
    }
    if (f.size === 0) {
      problems.push(`${f.name}: the file is empty.`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      problems.push(`${f.name}: the file is larger than 10 MB.`);
      continue;
    }
    if (alreadyHave + accepted.length >= MAX_FILES) {
      problems.push(`You can attach at most ${MAX_FILES} files.`);
      break;
    }
    accepted.push(f);
  }
  return { accepted, problems };
}

/** One short sentence for a toast, e.g. "a.exe: only ... (+2 more)". */
export function summarizeProblems(problems: string[]): string {
  return (
    problems[0] + (problems.length > 1 ? ` (+${problems.length - 1} more)` : "")
  );
}
