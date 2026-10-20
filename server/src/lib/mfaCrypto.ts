// Encrypts the authenticator secrets before they go into the database (AES-256-GCM).
// The key is MFA_ENCRYPTION_KEY in .env (kept OUT of the database and out of GitHub).
// Each value is also tied to its user: a secret copied to another user's row cannot be decrypted.
import crypto from "node:crypto";
import { config } from "../config/env";

const KEY = Buffer.from(config.mfaKey, "hex"); // 32 bytes

/** Secret bytes -> text for the database: base64 of [12 bytes iv][16 bytes tag][encrypted bytes]. */
export function encryptSecret(secret: Buffer, userId: number): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  cipher.setAAD(Buffer.from(`user:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/** The reverse. Throws if the value was changed, belongs to another user, or the key is wrong. */
export function decryptSecret(stored: string, userId: number): Buffer {
  const raw = Buffer.from(stored, "base64");
  if (raw.length < 12 + 16 + 1) throw new Error("Invalid stored secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    raw.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(`user:${userId}`));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}
