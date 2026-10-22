// Emergency reset of someone's two-factor authentication from the server's command line.
// Use it when NO administrator can sign in (for example the only ADMIN lost the phone and the recovery codes).
// Run:  npx tsx src/scripts/reset2fa.ts person@yourcompany.com
// The person is signed out everywhere and sets up two-factor authentication again at the next sign-in.
import { audit } from "../db/audit";
import { pool, withTx } from "../db/pool";
import { normEmail } from "../lib/validate";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "Usage: npx tsx src/scripts/reset2fa.ts person@yourcompany.com",
    );
    process.exit(1);
  }
  const email = normEmail(arg);

  await withTx(async (c) => {
    const r = await c.query(
      "SELECT id FROM users WHERE email = $1 FOR UPDATE",
      [email],
    );
    if (!r.rows[0])
      throw new Error(`There is no account with the email ${email}`);
    const id: number = r.rows[0].id;

    await c.query(
      `UPDATE users
          SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
              mfa_failed_count = 0, mfa_locked_until = NULL, password_changed_at = now(), updated_at = now()
        WHERE id = $1`,
      [id],
    );
    await c.query("DELETE FROM recovery_codes WHERE user_id = $1", [id]);
    await audit(c, {
      actorId: null,
      action: "MFA_RESET",
      entityType: "user",
      entityId: id,
      details: { email, by: "command line" },
    });
  });

  console.log(
    `Two-factor authentication was reset for ${email}. They must set it up again at their next sign-in.`,
  );
}

main()
  .catch((e) => {
    console.error("Reset failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
