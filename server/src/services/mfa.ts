// The shared parts of two-factor authentication: who is signing in, wrong-code lockout,
// checking a code, and recovery codes.
import type { Request } from "express";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { HttpError } from "../lib/http";
import { decryptSecret } from "../lib/mfaCrypto";
import { hashRecoveryCode, normalizeRecoveryCode } from "../lib/recoveryCodes";
import { verifyTotp } from "../lib/totp";
import { readMfaChallenge } from "../middleware/auth";

export const MAX_FAILURES = 5; // wrong codes in a row
export const LOCK_MINUTES = 15; // then locked this long

const EXPIRED = "Your sign-in expired. Please sign in again.";

/** The two-factor columns of a user. */
export interface MfaState {
  id: number;
  totp_secret_enc: string | null;
  totp_enabled_at: Date | null;
  totp_last_step: number | null;
  mfa_failed_count: number;
  mfa_locked_until: Date | null;
}

export interface MfaUser extends MfaState {
  email: string;
  name: string;
  role: "ADMIN" | "IT" | "USER";
  is_active: boolean;
  business_unit_id: number | null;
  password_changed_at: Date;
}

/** ADMIN and IT must use two-factor authentication; so must anyone who has it turned on. */
export function needsMfa(role: string, enabled: boolean): boolean {
  return role === "ADMIN" || role === "IT" || enabled;
}

/**
 * The person who passed the password step and is now entering a code (or setting up).
 * Throws 401 when the second-step cookie is missing or expired, the account was disabled,
 * or the password changed after the cookie was issued.
 * lock = true locks the user's row for the rest of the transaction (so two guesses cannot run at once).
 */
export async function loadChallengeUser(
  db: Db,
  req: Request,
  lock = false,
): Promise<MfaUser> {
  const challenge = readMfaChallenge(req);
  if (!challenge) throw new HttpError(401, EXPIRED);

  const r = await db.query(
    `SELECT id, email, name, role, is_active, business_unit_id, password_changed_at,
            totp_secret_enc, totp_enabled_at, totp_last_step, mfa_failed_count, mfa_locked_until
       FROM users WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [challenge.userId],
  );
  const u = r.rows[0] as MfaUser | undefined;
  if (!u || !u.is_active) throw new HttpError(401, EXPIRED);
  if (
    Math.floor(new Date(u.password_changed_at).getTime() / 1000) > challenge.iat
  )
    throw new HttpError(401, EXPIRED);
  if (!needsMfa(u.role, !!u.totp_enabled_at)) throw new HttpError(401, EXPIRED);
  return u;
}

/** Minutes left of a lockout (0 = not locked). */
export function lockedMinutes(u: MfaState): number {
  if (!u.mfa_locked_until) return 0;
  const msLeft = new Date(u.mfa_locked_until).getTime() - Date.now();
  return msLeft > 0 ? Math.ceil(msLeft / 60000) : 0;
}

/** Counts a wrong code. Returns true when this one caused the lockout. */
export async function recordFailure(c: Db, u: MfaState): Promise<boolean> {
  const next = u.mfa_failed_count + 1;
  if (next >= MAX_FAILURES) {
    await c.query(
      `UPDATE users SET mfa_failed_count = 0, mfa_locked_until = now() + make_interval(mins => $2::int) WHERE id = $1`,
      [u.id, LOCK_MINUTES],
    );
    await audit(c, {
      actorId: u.id,
      action: "MFA_LOCKED",
      entityType: "user",
      entityId: u.id,
    });
    return true;
  }
  await c.query("UPDATE users SET mfa_failed_count = $2 WHERE id = $1", [
    u.id,
    next,
  ]);
  return false;
}

export async function recordSuccess(c: Db, userId: number): Promise<void> {
  await c.query(
    "UPDATE users SET mfa_failed_count = 0, mfa_locked_until = NULL WHERE id = $1",
    [userId],
  );
}

/**
 * Checks a 6-digit code against this person's secret.
 * Returns the 30-second step it belongs to (the caller must save it), or null when it is wrong
 * or that step was already used.
 */
export function checkTotp(
  u: Pick<MfaState, "id" | "totp_secret_enc" | "totp_last_step">,
  code: string,
): number | null {
  if (!u.totp_secret_enc) return null;
  const secret = decryptSecret(u.totp_secret_enc, u.id);
  return verifyTotp(secret, code, u.totp_last_step);
}

// ---------------- recovery codes ----------------

/** Replaces ALL of a person's recovery codes with a new set (old ones stop working). */
export async function replaceRecoveryCodes(
  c: Db,
  userId: number,
  codes: string[],
): Promise<void> {
  await c.query("DELETE FROM recovery_codes WHERE user_id = $1", [userId]);
  for (const code of codes) {
    const normalized = normalizeRecoveryCode(code);
    if (!normalized) throw new Error("Invalid recovery code format");
    await c.query(
      "INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)",
      [userId, hashRecoveryCode(userId, normalized)],
    );
  }
}

/** Uses one recovery code. Works once: the UPDATE only matches a code that is not used yet. */
export async function useRecoveryCode(
  c: Db,
  userId: number,
  input: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(input);
  if (!normalized) return false;
  const r = await c.query(
    "UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id",
    [userId, hashRecoveryCode(userId, normalized)],
  );
  return (r.rowCount ?? 0) === 1;
}

export async function recoveryCodesLeft(
  db: Db,
  userId: number,
): Promise<number> {
  const r = await db.query(
    "SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  );
  return r.rows[0].n;
}
