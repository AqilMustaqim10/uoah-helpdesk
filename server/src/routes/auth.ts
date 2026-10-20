// Login, logout, sign up (with emailed code), forgot password.
// Security notes:
//  - login, sign up and forgot password give the SAME answer whether an email exists or not
//  - new accounts are ALWAYS role USER (the role is never read from the request)
//  - a password reset signs out every old session (password_changed_at)
//  - New in step H: ADMIN and IT (and anyone with two-factor authentication on) do not get a session
//    from the password alone. They get a short second-step cookie and must finish at /api/auth/2fa.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { query, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import {
  bodyId,
  cleanText,
  isAllowedDomain,
  normEmail,
  tryNormEmail,
  validatePassword,
} from "../lib/validate";
import {
  clearAuthCookie,
  clearMfaChallengeCookie,
  loadUserById,
  requireAuth,
  setAuthCookie,
  setMfaChallengeCookie,
} from "../middleware/auth";
import {
  codeRequestLimiter,
  codeVerifyLimiter,
  loginLimiter,
} from "../middleware/rateLimit";
import { issueCode, verifyCode } from "../lib/codes";
import { sendAccountExistsEmail, sendCodeEmail } from "../services/authMail";
import { needsMfa } from "../services/mfa";
import { publicUser } from "../services/publicUser";

const router = Router();

// Used so a login for an unknown email takes about as long as a real one.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-1", 12);

const GENERIC_CODE_SENT =
  "If the details are valid, a 6-digit code has been sent to your email.";
const BAD_CODE = "Invalid or expired code.";

/** Checks that a code from the browser looks like exactly 6 digits. */
function codeOf(v: unknown): string {
  if (typeof v !== "string" || !/^\d{6}$/.test(v.trim()))
    throw new HttpError(400, BAD_CODE);
  return v.trim();
}

/** Turns "wait N seconds" into the error the user sees. */
function tooSoon(wait: number): HttpError {
  return new HttpError(
    429,
    `Please wait ${wait} seconds before asking for a new code.`,
  );
}

// ---------------------------------------------------------------------------
// GET /api/auth/units  (public)  The sign-up form needs the list of business units.
// ---------------------------------------------------------------------------
router.get(
  "/units",
  ah(async (_req, res) => {
    const r = await query(
      "SELECT id, code, name FROM business_units ORDER BY name",
    );
    res.json({ units: r.rows });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/login   { email, password }
// Answers { user }                     -> signed in
//      or { mfa: 'verify' | 'setup' }  -> the password was right, a second step is still needed
// ---------------------------------------------------------------------------
router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const email = tryNormEmail(req.body?.email);
    const password = req.body?.password;
    const passwordOk =
      typeof password === "string" &&
      password.length > 0 &&
      password.length <= 200;

    const rows = email
      ? (
          await query(
            "SELECT id, password_hash, is_active, role, totp_enabled_at FROM users WHERE email = $1",
            [email],
          )
        ).rows
      : [];
    const row = rows[0];

    // Always run a password check (even for unknown emails) so timing reveals nothing.
    const match = await bcrypt.compare(
      passwordOk ? password : "x",
      row ? row.password_hash : DUMMY_HASH,
    );

    // One message for: unknown email, wrong password, disabled account.
    if (!row || !row.is_active || !passwordOk || !match) {
      throw new HttpError(401, "Invalid email or password.");
    }

    // The password is right. ADMIN, IT and anyone with two-factor authentication on need the second step.
    if (needsMfa(row.role, !!row.totp_enabled_at)) {
      clearAuthCookie(res); // no session until the second step is done
      setMfaChallengeCookie(res, row.id);
      res.json({ mfa: row.totp_enabled_at ? "verify" : "setup" });
      return;
    }

    setAuthCookie(res, row.id);
    const user = await loadUserById(row.id);
    res.json({ user: publicUser(user!) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout   (also cancels a half-finished sign-in)
// ---------------------------------------------------------------------------
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  clearMfaChallengeCookie(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  Who am I? (also how the web app checks it is still signed in)
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup/request   { email, name, password, business_unit_id }
// Step 1 of sign up: checks the details and emails a 6-digit code.
// Calling it again (after 60 s) sends a fresh code and cancels the old one.
// ---------------------------------------------------------------------------
router.post(
  "/signup/request",
  codeRequestLimiter,
  ah(async (req, res) => {
    const email = normEmail(req.body?.email);
    const name = cleanText(req.body?.name, "Name", { max: 100 });
    const password = validatePassword(req.body?.password);
    const unitId = bodyId(req.body?.business_unit_id, "business unit");

    // Only company email domains may register.
    if (!isAllowedDomain(email)) {
      throw new HttpError(
        400,
        "Registration is limited to company email addresses.",
      );
    }
    const unit = await query("SELECT id FROM business_units WHERE id = $1", [
      unitId,
    ]);
    if (!unit.rows[0])
      throw new HttpError(400, "Please choose a valid business unit.");

    // Hash first (always), so the response time is the same for new and existing emails.
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    // Existing account -> a "noop" code that can never be used. Same behaviour for the outside world.
    const issued = await issueCode(
      email,
      "SIGNUP",
      existing.rows[0]
        ? { noop: true }
        : { name, password_hash: passwordHash, business_unit_id: unitId },
    );
    if (issued.wait > 0) throw tooSoon(issued.wait);

    if (existing.rows[0]) sendAccountExistsEmail(email);
    else sendCodeEmail(email, "SIGNUP", issued.code!);

    res.json({ ok: true, message: GENERIC_CODE_SENT });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/signup/verify   { email, code }
// Step 2: right code -> account is created (role USER) and the person is signed in.
// ---------------------------------------------------------------------------
router.post(
  "/signup/verify",
  codeVerifyLimiter,
  ah(async (req, res) => {
    const email = normEmail(req.body?.email);
    const code = codeOf(req.body?.code);

    let newId: number | null;
    try {
      newId = await withTx(async (c) => {
        const payload = await verifyCode(c, email, "SIGNUP", code);
        // Do NOT throw here: returning lets the wrong-attempt counter be saved.
        if (!payload || payload.noop || !isAllowedDomain(email)) return null;

        // The role is hard-coded to USER. Nothing from the request can change it.
        const ins = await c.query(
          `INSERT INTO users (email, name, password_hash, role, business_unit_id)
           VALUES ($1, $2, $3, 'USER', $4) RETURNING id`,
          [
            email,
            payload.name,
            payload.password_hash,
            payload.business_unit_id,
          ],
        );
        await audit(c, {
          actorId: ins.rows[0].id,
          action: "USER_REGISTERED",
          entityType: "user",
          entityId: ins.rows[0].id,
          details: { email },
        });
        return ins.rows[0].id as number;
      });
    } catch (err) {
      // 23505 = the email was registered by someone else a moment ago
      if ((err as { code?: string }).code === "23505") newId = null;
      else throw err;
    }

    if (newId === null) throw new HttpError(400, BAD_CODE);

    setAuthCookie(res, newId); // new accounts are always USER, so no second step
    const user = await loadUserById(newId);
    res.status(201).json({ user: publicUser(user!) });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/forgot/request   { email }
// ALWAYS answers the same way, whether the email has an account or not.
// ---------------------------------------------------------------------------
router.post(
  "/forgot/request",
  codeRequestLimiter,
  ah(async (req, res) => {
    const email = tryNormEmail(req.body?.email);
    if (!email) {
      res.json({ ok: true, message: GENERIC_CODE_SENT });
      return;
    }

    // Only active accounts can reset. Unknown or disabled emails get a "noop" code.
    const u = await query(
      "SELECT id FROM users WHERE email = $1 AND is_active = TRUE",
      [email],
    );
    const issued = await issueCode(
      email,
      "RESET",
      u.rows[0] ? {} : { noop: true },
    );
    if (issued.wait > 0) throw tooSoon(issued.wait);

    if (u.rows[0]) sendCodeEmail(email, "RESET", issued.code!);

    res.json({ ok: true, message: GENERIC_CODE_SENT });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/forgot/reset   { email, code, new_password }
// Right code -> new password saved, and every old session is signed out.
// (ADMIN and IT still need their authenticator code to sign in afterwards.)
// ---------------------------------------------------------------------------
router.post(
  "/forgot/reset",
  codeVerifyLimiter,
  ah(async (req, res) => {
    const email = normEmail(req.body?.email);
    const code = codeOf(req.body?.code);
    const newPassword = validatePassword(req.body?.new_password);
    const hash = await bcrypt.hash(newPassword, 12);

    const ok = await withTx(async (c) => {
      const payload = await verifyCode(c, email, "RESET", code);
      if (!payload || payload.noop) return false;

      // password_changed_at = now: every cookie issued BEFORE this moment stops working.
      // (We use the Node clock, the same clock that stamps the cookies.)
      const u = await c.query(
        `UPDATE users
            SET password_hash = $2, password_changed_at = $3, updated_at = now()
          WHERE email = $1 AND is_active = TRUE
          RETURNING id`,
        [email, hash, new Date()],
      );
      if (!u.rows[0]) return false;

      await audit(c, {
        actorId: u.rows[0].id,
        action: "PASSWORD_RESET",
        entityType: "user",
        entityId: u.rows[0].id,
      });
      return true;
    });

    if (!ok) throw new HttpError(400, BAD_CODE);

    clearAuthCookie(res);
    clearMfaChallengeCookie(res);
    res.json({
      ok: true,
      message: "Password updated. Please sign in with your new password.",
    });
  }),
);

export default router;
