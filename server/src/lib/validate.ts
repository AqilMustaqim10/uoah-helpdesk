// Input checking helpers. Every value from the browser or from an email
// goes through one of these before touching the database.
import { HttpError } from "./http";
import { config } from "../config/env";

// Control characters (invisible junk) that we strip out of text.
const CTRL_SINGLE = /[\u0000-\u001F\u007F]/g; // for one-line text
const CTRL_MULTI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // for multi-line text (keeps newline/tab)

export interface TextOpts {
  min?: number;
  max: number;
  multiline?: boolean;
}

/** Trims text, removes control characters, and enforces length. Throws 400 if invalid. */
export function cleanText(v: unknown, field: string, o: TextOpts): string {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required.`);
  const s = v.replace(o.multiline ? CTRL_MULTI : CTRL_SINGLE, "").trim();
  const min = o.min ?? 1;
  if (s.length < min)
    throw new HttpError(400, `${field} must be at least ${min} character(s).`);
  if (s.length > o.max)
    throw new HttpError(400, `${field} must be at most ${o.max} characters.`);
  return s;
}

/** Same as cleanText, but empty / missing gives null instead of an error. */
export function optionalText(
  v: unknown,
  field: string,
  o: TextOpts,
): string | null {
  if (
    v === undefined ||
    v === null ||
    (typeof v === "string" && v.trim() === "")
  )
    return null;
  return cleanText(v, field, { ...o, min: o.min ?? 1 });
}

/** Whitelist check: the value must be exactly one of the allowed options (e.g. a valid status). */
export function oneOf<T extends string>(
  v: unknown,
  list: readonly T[],
  field: string,
): T {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) {
    throw new HttpError(400, `Invalid ${field}.`);
  }
  return v as T;
}

/** An id from the URL (like /tickets/12). A bad id looks like "not found" so nothing is revealed. */
export function idParam(v: unknown): number {
  if (typeof v !== "string" && typeof v !== "number")
    throw new HttpError(404, "Not found");
  const s = String(v);
  if (!/^\d{1,15}$/.test(s)) throw new HttpError(404, "Not found");
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(404, "Not found");
  return n;
}

/** An id inside a JSON body. A bad value gives 400. */
export function bodyId(v: unknown, field: string): number {
  const n = typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid ${field}.`);
  }
  return n;
}

// A simple email shape check (something@something.something, no spaces or odd characters).
const EMAIL_RE =
  /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]+$/;

/** Lowercases and validates an email. Throws 400 if invalid. */
export function normEmail(v: unknown): string {
  if (typeof v !== "string")
    throw new HttpError(400, "A valid email is required.");
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e))
    throw new HttpError(400, "A valid email is required.");
  return e;
}

/** Same as normEmail but returns null instead of throwing (used by the email worker). */
export function tryNormEmail(v: unknown): string | null {
  try {
    return normEmail(v);
  } catch {
    return null;
  }
}

/** Returns the part after the @ (e.g. "example.com"). */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** Is this email's domain on the ALLOWED_SENDER_DOMAINS list? */
export function isAllowedDomain(email: string): boolean {
  return config.allowedDomains.includes(emailDomain(email));
}

/** Password rules: 10+ characters, at least one letter and one number, max 72 bytes (bcrypt limit). */
export function validatePassword(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "Password is required.");
  if (v.length < 10)
    throw new HttpError(400, "Password must be at least 10 characters.");
  if (Buffer.byteLength(v, "utf8") > 72)
    throw new HttpError(400, "Password is too long (max 72 bytes).");
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    throw new HttpError(
      400,
      "Password must contain at least one letter and one number.",
    );
  }
  return v;
}

/** Removes line breaks from an email subject so nobody can inject extra mail headers. */
export function safeSubject(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(CTRL_SINGLE, "")
    .trim()
    .slice(0, 200);
}

/** Escapes < > & " ' so user text can never become HTML inside an email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------- Branding checks ----------------

/** How bright a color is (0 = black, 1 = white), using the standard accessibility formula. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Contrast ratio between white text and this background color. Needs 4.5 or more to be readable. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Brand color must be #RRGGBB and dark enough for white text (4.5:1). */
export function validateBrandColor(v: unknown): string {
  if (typeof v !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
    throw new HttpError(400, "Brand color must look like #RRGGBB.");
  }
  const hex = v.trim().toUpperCase();
  if (contrastWithWhite(hex) < 4.5) {
    throw new HttpError(
      400,
      "Brand color is too light: white text on it needs a contrast ratio of at least 4.5:1.",
    );
  }
  return hex;
}

/** Branding display text: 2-40 characters, no < or >. */
export function validateBrandText(v: unknown): string {
  const s = cleanText(v, "Display text", { min: 2, max: 40 });
  if (/[<>]/.test(s))
    throw new HttpError(400, "Display text cannot contain < or >.");
  return s;
}
