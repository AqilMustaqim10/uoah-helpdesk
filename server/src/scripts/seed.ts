// One-time setup script. Run with: npm run seed
// 1) Creates the six business units.
// 2) Creates the first ADMIN account from SEED_ADMIN_* in .env.
// It is safe to run again: existing units and the existing admin are left alone.
import bcrypt from "bcryptjs";
import { config } from "../config/env";
import { pool, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { UNIT_DEFAULTS } from "../config/constants";
import { normEmail, validatePassword } from "../lib/validate";

async function main() {
  // Everything below happens in one transaction: all saved, or nothing saved.
  await withTx(async (c) => {
    // ----- 1) The six business units -----
    for (const u of UNIT_DEFAULTS) {
      const r = await c.query(
        `INSERT INTO business_units (code, name, brand_text)
         VALUES ($1, $2, $2)
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [u.code, u.name],
      );
      console.log(`${r.rowCount ? "Created" : "Exists "} unit ${u.code}`);
    }

    // ----- 2) The first admin (skipped if .env has no admin details) -----
    if (!config.seed.email || !config.seed.password) {
      console.log(
        "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin.",
      );
      return;
    }
    const email = normEmail(config.seed.email);
    const password = validatePassword(config.seed.password);

    const existing = await c.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows[0]) {
      console.log(`Admin ${email} already exists, nothing to do.`);
      return;
    }

    // The admin belongs to the HQ unit
    const hq = await c.query(`SELECT id FROM business_units WHERE code = 'HQ'`);
    const hash = await bcrypt.hash(password, 12); // the password is stored only as a hash
    const ins = await c.query(
      `INSERT INTO users (email, name, password_hash, role, business_unit_id)
       VALUES ($1, $2, $3, 'ADMIN', $4) RETURNING id`,
      [email, config.seed.name.slice(0, 100), hash, hq.rows[0].id],
    );

    // Record it in the audit log (same transaction)
    await audit(c, {
      actorId: null,
      action: "USER_SEEDED_ADMIN",
      entityType: "user",
      entityId: ins.rows[0].id,
      details: { email },
    });
    console.log(
      `Created ADMIN ${email} (unit HQ). You can change the password later with "Forgot password".`,
    );
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end()); // close the database connection so the script can exit
