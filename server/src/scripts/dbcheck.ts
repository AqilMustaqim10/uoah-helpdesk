// Checks what the limited database role (helpdesk_app) can and cannot do. Run:  npm run dbcheck
// Every "forbidden" action is really TRIED inside a transaction that is always rolled back, so nothing changes.
// A forbidden action that succeeds is a [FAIL]: the role has more power than it should.
import { pool } from "../db/pool";

interface Probe {
  label: string;
  sql: string;
  expect: "allowed" | "denied";
}

const PROBES: Probe[] = [
  // The app must be able to do its work
  {
    label: "read users",
    sql: "SELECT 1 FROM users LIMIT 1",
    expect: "allowed",
  },
  {
    label: "read the audit log",
    sql: "SELECT 1 FROM audit_log LIMIT 1",
    expect: "allowed",
  },
  {
    label: "add to the audit log",
    sql: `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('dbcheck', '0', 'DBCHECK')`,
    expect: "allowed",
  },
  {
    label: "delete tickets (erase)",
    sql: "DELETE FROM tickets WHERE false",
    expect: "allowed",
  },
  // The audit log can never be changed
  {
    label: "change audit log rows",
    sql: `UPDATE audit_log SET action = action`,
    expect: "denied",
  },
  {
    label: "delete audit log rows",
    sql: "DELETE FROM audit_log",
    expect: "denied",
  },
  {
    label: "empty the audit log (TRUNCATE)",
    sql: "TRUNCATE audit_log",
    expect: "denied",
  },
  {
    label: "remove the audit log protection (DROP TRIGGER)",
    sql: "DROP TRIGGER audit_log_no_update_delete ON audit_log",
    expect: "denied",
  },
  // Things the app never needs
  { label: "delete users", sql: "DELETE FROM users", expect: "denied" },
  {
    label: "delete business units",
    sql: "DELETE FROM business_units",
    expect: "denied",
  },
  { label: "delete articles", sql: "DELETE FROM articles", expect: "denied" },
  {
    label: "empty the tickets table (TRUNCATE)",
    sql: "TRUNCATE tickets",
    expect: "denied",
  },
  { label: "drop a table", sql: "DROP TABLE tickets", expect: "denied" },
  {
    label: "change a table (ALTER)",
    sql: "ALTER TABLE users ADD COLUMN dbcheck_probe int",
    expect: "denied",
  },
  {
    label: "create a table",
    sql: "CREATE TABLE dbcheck_probe (id int)",
    expect: "denied",
  },
  {
    label: "create a role",
    sql: "CREATE ROLE dbcheck_probe",
    expect: "denied",
  },
];

// "denied" must be an honest refusal (no permission, or the audit trigger), not a typing mistake in the test
const DENIED_CODES = new Set(["42501", "P0001"]);

async function main() {
  let failures = 0;
  const line = (ok: boolean, text: string) => {
    if (!ok) failures++;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${text}`);
  };

  // 1) What kind of role is this?
  const me = await pool.query(
    `SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
  );
  const r = me.rows[0];
  console.log(`Connected as: ${r.name}\n`);
  line(!r.rolsuper, "not a superuser");
  line(!r.rolcreatedb && !r.rolcreaterole, "cannot create databases or roles");
  line(
    !r.rolreplication && !r.rolbypassrls,
    "no replication or row-security bypass",
  );
  console.log("");

  // 2) Try everything
  for (const probe of PROBES) {
    const client = await pool.connect();
    let outcome: "allowed" | "denied" | "error" = "allowed";
    let code = "";
    try {
      await client.query("BEGIN");
      await client.query(probe.sql);
    } catch (e) {
      code = (e as { code?: string }).code ?? "";
      outcome = DENIED_CODES.has(code) ? "denied" : "error";
    } finally {
      try {
        await client.query("ROLLBACK"); // ALWAYS undone
      } catch {
        /* ignore */
      }
      client.release();
    }

    if (outcome === "error") {
      line(
        false,
        `${probe.label}: the test itself failed (error ${code || "unknown"})`,
      );
    } else if (probe.expect === "allowed") {
      line(
        outcome === "allowed",
        `can ${probe.label}${outcome === "allowed" ? "" : ` (it was refused with ${code}, the app needs this)`}`,
      );
    } else {
      line(
        outcome === "denied",
        `cannot ${probe.label}${outcome === "denied" ? "" : " (IT WAS ALLOWED: this role has too much power)"}`,
      );
    }
  }

  console.log(
    failures === 0
      ? "\nAll checks passed."
      : `\n${failures} check(s) failed. Run server/sql/hardening_db.sql, or tell me the [FAIL] lines.`,
  );
  await pool.end();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (err: Error) => {
  console.error("FAILED:", err.message);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
