// Builds CSV text that is safe to open in Excel.

// A cell starting with = + - @ (or a tab / carriage return) could be run as a FORMULA by Excel.
// We put a ' in front so it is treated as plain text ("formula injection" protection).
const DANGEROUS_START = /^[=+\-@\t\r]/;

/** One safe CSV cell. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);

  if (DANGEROUS_START.test(s)) s = `'${s}`;

  // Cells with commas, quotes or line breaks must be wrapped in quotes (quotes are doubled)
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Whole CSV file. The leading \uFEFF makes Excel read accents and other characters correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
