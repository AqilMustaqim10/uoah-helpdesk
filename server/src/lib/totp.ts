// Time-based one-time codes (TOTP, RFC 6238): the 6-digit codes an authenticator app shows.
// Written on Node's own crypto (no library). Verified against the official test values in scripts/totptest.ts.
import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // base32, the format authenticator apps use for keys
const STEP_SECONDS = 30; // a new code every 30 seconds
const WINDOW = 1; // also accept the code just before and just after (clock differences)

/** Bytes -> base32 text, for example for the key shown next to the QR code. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // keep only the bits that are not used yet
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 text -> bytes. Spaces, dashes and "=" are ignored. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 text");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (20 random bytes = 160 bits). */
export function generateSecret(): Buffer {
  return crypto.randomBytes(20);
}

/** The address that authenticator apps understand (the QR code contains exactly this). */
export function otpauthUri(
  secretBase32: string,
  account: string,
  issuer: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** The 6-digit code for one counter value (RFC 4226). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** The code an authenticator app shows at a given time (milliseconds since 1970). */
export function totpAt(secret: Buffer, timeMs: number): string {
  return hotp(secret, Math.floor(timeMs / 1000 / STEP_SECONDS));
}

/**
 * Checks a code the person typed.
 * Returns the 30-second step it belongs to, or null when it is wrong.
 * `lastStep` = the last step already accepted for this person: that step or an older one is refused,
 * so the same code can never be used twice (replay protection).
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  lastStep: number | null,
  nowMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
  const given = Buffer.from(code);

  let matched: number | null = null;
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    // Always compare all steps, with a timing-safe comparison
    const same = crypto.timingSafeEqual(Buffer.from(hotp(secret, step)), given);
    if (
      same &&
      (lastStep === null || step > lastStep) &&
      (matched === null || step > matched)
    )
      matched = step;
  }
  return matched;
}
