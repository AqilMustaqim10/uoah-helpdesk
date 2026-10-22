// ADMIN only (index.ts mounts this behind requireRole('ADMIN') at /api/users):
// reset someone's two-factor authentication, for example after they lost their phone.
import { Router } from "express";
import { withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { idParam } from "../lib/validate";
import { writeLimiter } from "../middleware/rateLimit";

const router = Router();

// POST /api/users/:id/reset-2fa
router.post(
  "/:id/reset-2fa",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);

    await withTx(async (c) => {
      const r = await c.query(
        "SELECT id, email, totp_enabled_at, totp_secret_enc FROM users WHERE id = $1 FOR UPDATE",
        [id],
      );
      const target = r.rows[0];
      if (!target) throw new HttpError(404, "Not found");
      if (target.id === actor.id) {
        throw new HttpError(
          403,
          "You cannot reset your own two-factor authentication. Ask another administrator.",
        );
      }
      if (!target.totp_enabled_at && !target.totp_secret_enc) {
        throw new HttpError(
          409,
          "Two-factor authentication is not set up for this person.",
        );
      }

      // password_changed_at = now() signs the person out of every session, so a stolen session dies with the reset
      await c.query(
        `UPDATE users
            SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
                mfa_failed_count = 0, mfa_locked_until = NULL, password_changed_at = now(), updated_at = now()
          WHERE id = $1`,
        [id],
      );
      await c.query("DELETE FROM recovery_codes WHERE user_id = $1", [id]);
      await audit(c, {
        actorId: actor.id,
        action: "MFA_RESET",
        entityType: "user",
        entityId: id,
        details: { email: target.email },
      });
    });

    res.json({ ok: true });
  }),
);

export default router;
