// The 6-digit email codes used for sign up and password reset.
// Rules enforced here:
//  - the code is stored only as an HMAC hash (never the real code)
//  - expires after 10 minutes, max 5 wrong tries, 60 s gap between requests
//  - only the NEWEST code for an email works (older ones are deleted)
//  - the comparison is timing-safe
import crypto from "node:crypto";
import type { Db } from "../db/pool";
import { withTx } from "../db/pool";
import { config } from "../config/env";

export type CodePurpose = "SIGNUP" | "RESET";

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_GAP_SECONDS = 60;

/** Makes a random 6-digit code such as "042917" (cryptographically random). */
function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Hash of the code, tied to the purpose and the email so it can't be reused elsewhere. */
function hashCode(purpose: CodePurpose, email: string, code: string): string {
  return crypto
    .createHmac("sha256", config.codeSecret)
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");
}

/** Compares two hex hashes in constant time (stops attackers learning anything from timing). */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Creates a new code for this email, unless one was made less than 60 seconds ago.
 * Returns { wait } (seconds to wait) when too soon, otherwise { wait: 0, code }.
 *
 * `payload` is saved with the code. For sign up it holds the pending account details
 * (name, password HASH, unit). A { noop: true } payload is used when the email should NOT
 * actually get a working code (unknown email, existing account...), so the outside world
 * sees exactly the same behaviour either way.
 */
export async function issueCode(
  email: string,
  purpose: CodePurpose,
  payload: Record<string, unknown>,
): Promise<{ wait: number; code?: string }> {
  return withTx(async (c) => {
    // Lock per email+purpose so two quick requests can't both slip past the 60 s gap.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${purpose}:${email}`,
    ]);

    // How many seconds until the next code may be requested?
    const gap = await c.query(
      `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM
                (created_at + make_interval(secs => $3::double precision) - now()))))::int AS wait
         FROM email_codes
        WHERE email = $1 AND purpose = $2
        ORDER BY created_at DESC LIMIT 1`,
      [email, purpose, RESEND_GAP_SECONDS],
    );
    const wait: number = gap.rows[0]?.wait ?? 0;
    if (wait > 0) return { wait };

    // Housekeeping: remove very old expired codes, and ALL older codes for this email (newest only).
    await c.query(
      `DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'`,
    );
    await c.query(`DELETE FROM email_codes WHERE email = $1 AND purpose = $2`, [
      email,
      purpose,
    ]);

    const code = generateCode();
    await c.query(
      `INSERT INTO email_codes (email, purpose, code_hash, payload, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, now() + make_interval(mins => $5::int))`,
      [
        email,
        purpose,
        hashCode(purpose, email, code),
        JSON.stringify(payload),
        CODE_TTL_MINUTES,
      ],
    );
    return { wait: 0, code };
  });
}

/**
 * Checks a code. Call it INSIDE a transaction (pass the transaction client `db`).
 * Returns the saved payload when the code is right, otherwise null.
 *
 * IMPORTANT: when it returns null, the caller must NOT throw inside the transaction.
 * Return normally, let the transaction commit (this saves the "wrong attempt" counter),
 * and throw the error AFTER the transaction. Otherwise the counter would be rolled back.
 */
export async function verifyCode(
  db: Db,
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<Record<string, any> | null> {
  // Lock the newest code row so two parallel guesses can't both be counted wrongly.
  const r = await db.query(
    `SELECT id, code_hash, payload, attempts, (expires_at < now()) AS expired
       FROM email_codes
      WHERE email = $1 AND purpose = $2
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE`,
    [email, purpose],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.expired || row.attempts >= MAX_ATTEMPTS) return null;

  // Count this attempt BEFORE comparing, so it counts even if the code is wrong.
  await db.query(
    "UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1",
    [row.id],
  );

  if (!safeEqualHex(row.code_hash, hashCode(purpose, email, code))) return null;

  // Correct: use it up (one-time use).
  await db.query("DELETE FROM email_codes WHERE email = $1 AND purpose = $2", [
    email,
    purpose,
  ]);
  return row.payload;
}
