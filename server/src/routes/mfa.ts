// Two-factor authentication. Mounted at /api/auth/2fa.
//  - verify, setup/start, setup/confirm : for someone who passed the password step (second-step cookie)
//  - status, recovery/regenerate        : for someone who is signed in
// Wrong codes give 400 (never 401, which would sign a signed-in person out). 401 only means "start again".
import { Router } from "express";
import QRCode from "qrcode";
import { pool, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { decryptSecret, encryptSecret } from "../lib/mfaCrypto";
import { newRecoveryCodes } from "../lib/recoveryCodes";
import { base32Encode, generateSecret, otpauthUri } from "../lib/totp";
import {
  clearMfaChallengeCookie,
  loadUserById,
  requireAuth,
  setAuthCookie,
} from "../middleware/auth";
import { mfaLimiter } from "../middleware/rateLimit";
import {
  LOCK_MINUTES,
  checkTotp,
  loadChallengeUser,
  lockedMinutes,
  recordFailure,
  recordSuccess,
  recoveryCodesLeft,
  replaceRecoveryCodes,
  useRecoveryCode,
  type MfaState,
} from "../services/mfa";
import { publicUser } from "../services/publicUser";

const router = Router();
const ISSUER = "UOA IT Helpdesk";

const lockedError = (minutes: number) =>
  new HttpError(
    429,
    `Too many wrong codes. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  );

/** These answers hold secrets: browsers and proxies must never keep a copy. */
function noStore(res: { setHeader(name: string, value: string): unknown }) {
  res.setHeader("Cache-Control", "no-store");
}

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/verify   { code }   a 6-digit code OR a recovery code
// ---------------------------------------------------------------------------
type VerifyOutcome =
  | { kind: "ok"; userId: number; recoveryLeft: number | null }
  | { kind: "needs-setup" }
  | { kind: "wrong" }
  | { kind: "locked"; minutes: number };

router.post(
  "/verify",
  mfaLimiter,
  ah(async (req, res) => {
    const raw = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!raw || raw.length > 40)
      throw new HttpError(400, "Enter your 6-digit code or a recovery code.");

    const outcome = await withTx<VerifyOutcome>(async (c) => {
      const u = await loadChallengeUser(c, req, true); // locks the row: guesses are handled one at a time
      if (!u.totp_enabled_at) return { kind: "needs-setup" };

      const wait = lockedMinutes(u);
      if (wait > 0) return { kind: "locked", minutes: wait };

      let ok = false;
      let usedRecovery = false;
      if (/^\d{6}$/.test(raw)) {
        const step = checkTotp(u, raw);
        if (step !== null) {
          // Remember the step: the same code cannot be used again (the WHERE also stops two parallel uses)
          const upd = await c.query(
            "UPDATE users SET totp_last_step = $2::bigint WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2::bigint)",
            [u.id, step],
          );
          ok = (upd.rowCount ?? 0) === 1;
        }
      } else {
        ok = await useRecoveryCode(c, u.id, raw);
        usedRecovery = ok;
      }

      // A wrong code is counted and SAVED (we return instead of throwing, so the transaction commits)
      if (!ok) {
        const lockedNow = await recordFailure(c, u);
        return lockedNow
          ? { kind: "locked", minutes: LOCK_MINUTES }
          : { kind: "wrong" };
      }

      await recordSuccess(c, u.id);

      let recoveryLeft: number | null = null;
      if (usedRecovery) {
        recoveryLeft = await recoveryCodesLeft(c, u.id);
        await audit(c, {
          actorId: u.id,
          action: "MFA_RECOVERY_USED",
          entityType: "user",
          entityId: u.id,
          details: { left: recoveryLeft },
        });
      }
      return { kind: "ok", userId: u.id, recoveryLeft };
    });

    if (outcome.kind === "needs-setup")
      throw new HttpError(
        409,
        "Please set up two-factor authentication first.",
      );
    if (outcome.kind === "locked") throw lockedError(outcome.minutes);
    if (outcome.kind === "wrong")
      throw new HttpError(400, "That code is not correct. Please try again.");

    // Success: the second-step cookie is replaced by a real session that remembers the second step
    clearMfaChallengeCookie(res);
    setAuthCookie(res, outcome.userId, true);
    const user = await loadUserById(outcome.userId);
    noStore(res);
    res.json({ user: publicUser(user!), recoveryLeft: outcome.recoveryLeft });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/setup/start
// Creates the secret (or returns the one still waiting for its first code, so reloading the page is safe).
// ---------------------------------------------------------------------------
router.post(
  "/setup/start",
  mfaLimiter,
  ah(async (req, res) => {
    const prepared = await withTx(async (c) => {
      const u = await loadChallengeUser(c, req, true);
      if (u.totp_enabled_at)
        throw new HttpError(
          409,
          "Two-factor authentication is already set up.",
        );

      let secret: Buffer;
      if (u.totp_secret_enc) {
        secret = decryptSecret(u.totp_secret_enc, u.id); // reuse the secret that is still waiting
      } else {
        secret = generateSecret();
        await c.query(
          "UPDATE users SET totp_secret_enc = $2, totp_last_step = NULL WHERE id = $1",
          [u.id, encryptSecret(secret, u.id)],
        );
      }
      return { secret, email: u.email };
    });

    const b32 = base32Encode(prepared.secret);
    const uri = otpauthUri(b32, prepared.email, ISSUER);
    const qr = await QRCode.toDataURL(uri, {
      margin: 1,
      width: 224,
      errorCorrectionLevel: "M",
    });

    noStore(res);
    res.json({ secret: b32, uri, qr });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/setup/confirm   { code }
// The right code turns two-factor authentication on, creates the recovery codes, and signs the person in.
// ---------------------------------------------------------------------------
type ConfirmOutcome =
  | { kind: "ok"; userId: number; codes: string[] }
  | { kind: "already" }
  | { kind: "no-secret" }
  | { kind: "wrong" }
  | { kind: "locked"; minutes: number };

router.post(
  "/setup/confirm",
  mfaLimiter,
  ah(async (req, res) => {
    const raw = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(raw))
      throw new HttpError(
        400,
        "Enter the 6-digit code from your authenticator app.",
      );

    const outcome = await withTx<ConfirmOutcome>(async (c) => {
      const u = await loadChallengeUser(c, req, true);
      if (u.totp_enabled_at) return { kind: "already" };
      if (!u.totp_secret_enc) return { kind: "no-secret" };

      const wait = lockedMinutes(u);
      if (wait > 0) return { kind: "locked", minutes: wait };

      const step = checkTotp(u, raw);
      if (step === null) {
        const lockedNow = await recordFailure(c, u);
        return lockedNow
          ? { kind: "locked", minutes: LOCK_MINUTES }
          : { kind: "wrong" };
      }

      await c.query(
        "UPDATE users SET totp_enabled_at = now(), totp_last_step = $2::bigint WHERE id = $1",
        [u.id, step],
      );
      const codes = newRecoveryCodes();
      await replaceRecoveryCodes(c, u.id, codes);
      await recordSuccess(c, u.id);
      await audit(c, {
        actorId: u.id,
        action: "MFA_ENABLED",
        entityType: "user",
        entityId: u.id,
        details: { email: u.email },
      });
      return { kind: "ok", userId: u.id, codes };
    });

    if (outcome.kind === "already")
      throw new HttpError(409, "Two-factor authentication is already set up.");
    if (outcome.kind === "no-secret")
      throw new HttpError(409, "Please start the setup again.");
    if (outcome.kind === "locked") throw lockedError(outcome.minutes);
    if (outcome.kind === "wrong")
      throw new HttpError(
        400,
        "That code is not correct. Check the code in your app and try again.",
      );

    clearMfaChallengeCookie(res);
    setAuthCookie(res, outcome.userId, true);
    const user = await loadUserById(outcome.userId);
    noStore(res);
    // The recovery codes are shown ONCE, here. Only their hashes are stored.
    res
      .status(201)
      .json({ user: publicUser(user!), recoveryCodes: outcome.codes });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/2fa/status   (signed in)
// ---------------------------------------------------------------------------
router.get(
  "/status",
  requireAuth,
  ah(async (req, res) => {
    const left = await recoveryCodesLeft(pool, req.user!.id);
    res.json({ enabled: req.user!.two_factor, recoveryCodesLeft: left });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/recovery/regenerate   { code }   (signed in; needs a CURRENT 6-digit code)
// ---------------------------------------------------------------------------
type RegenOutcome =
  | { kind: "ok"; codes: string[] }
  | { kind: "off" }
  | { kind: "wrong" }
  | { kind: "locked"; minutes: number };

router.post(
  "/recovery/regenerate",
  requireAuth,
  mfaLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const raw = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(raw))
      throw new HttpError(
        400,
        "Enter the 6-digit code from your authenticator app.",
      );

    const outcome = await withTx<RegenOutcome>(async (c) => {
      const r = await c.query(
        `SELECT id, totp_secret_enc, totp_enabled_at, totp_last_step, mfa_failed_count, mfa_locked_until
           FROM users WHERE id = $1 FOR UPDATE`,
        [user.id],
      );
      const u = r.rows[0] as MfaState | undefined;
      if (!u || !u.totp_enabled_at) return { kind: "off" };

      const wait = lockedMinutes(u);
      if (wait > 0) return { kind: "locked", minutes: wait };

      const step = checkTotp(u, raw);
      if (step === null) {
        const lockedNow = await recordFailure(c, u);
        return lockedNow
          ? { kind: "locked", minutes: LOCK_MINUTES }
          : { kind: "wrong" };
      }

      await c.query(
        "UPDATE users SET totp_last_step = $2::bigint WHERE id = $1",
        [u.id, step],
      );
      const codes = newRecoveryCodes();
      await replaceRecoveryCodes(c, u.id, codes); // the old codes stop working
      await recordSuccess(c, u.id);
      await audit(c, {
        actorId: u.id,
        action: "MFA_RECOVERY_REGENERATED",
        entityType: "user",
        entityId: u.id,
      });
      return { kind: "ok", codes };
    });

    if (outcome.kind === "off")
      throw new HttpError(409, "Two-factor authentication is not turned on.");
    if (outcome.kind === "locked") throw lockedError(outcome.minutes);
    if (outcome.kind === "wrong")
      throw new HttpError(400, "That code is not correct. Please try again.");

    noStore(res);
    res.json({ recoveryCodes: outcome.codes });
  }),
);

export default router;
