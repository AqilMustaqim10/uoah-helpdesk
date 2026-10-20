// Recovery codes: the one-time codes used when the phone is lost. Shown ONCE, stored only as hashes.
import crypto from "node:crypto";
import { config } from "../config/env";

// 31 characters without look-alikes (no 0 O 1 I L), so codes are easy to read and type
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;

/** Ten new codes like "K7M2P-9XQ4T" (random, all different). */
export function newRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    let s = "";
    for (let i = 0; i < 10; i++)
      s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    out.add(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return [...out];
}

/** What the person typed -> the 10 plain characters, or null when it cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  return new RegExp(`^[${ALPHABET}]{10}$`).test(s) ? s : null;
}

/** A keyed hash (uses a server secret), tied to the user. Only this goes into the database. */
export function hashRecoveryCode(userId: number, normalized: string): string {
  return crypto
    .createHmac("sha256", config.codeSecret)
    .update(`recovery:${userId}:${normalized}`)
    .digest("hex");
}
