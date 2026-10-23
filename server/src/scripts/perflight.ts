// "Is this computer ready to go live?" Run:  npm run preflight
// It reads server/.env and the database, and prints [ OK ], [WARN] or [FAIL] for every check.
// It changes nothing. Fix every [FAIL] before real people use the helpdesk. Read every [WARN].
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";

type Level = "OK" | "WARN" | "FAIL";
type Row = { head: string } | { level: Level; label: string; hint?: string };

const rows: Row[] = [];
const head = (title: string) => rows.push({ head: title });
const ok = (label: string) => rows.push({ level: "OK", label });
const warn = (label: string, hint: string) =>
  rows.push({ level: "WARN", label, hint });
const fail = (label: string, hint: string) =>
  rows.push({ level: "FAIL", label, hint });
/** good -> OK; otherwise FAIL (or WARN). */
const check = (
  good: boolean,
  label: string,
  hint: string,
  level: "FAIL" | "WARN" = "FAIL",
) =>
  good ? ok(label) : level === "FAIL" ? fail(label, hint) : warn(label, hint);

const env = (name: string) => (process.env[name] ?? "").trim();
const looksLikeExample = (v: string) =>
  /(paste_|change_?me|changethis|your_|example\.com|password123)/i.test(v);
const randomEnough = (v: string, minLength: number, minDistinct: number) =>
  v.length >= minLength &&
  !looksLikeExample(v) &&
  new Set(v).size >= minDistinct;

// ---------------------------------------------------------------------------
function checkSecrets() {
  head("Secrets");
  const jwt = env("JWT_SECRET");
  const code = env("CODE_HMAC_SECRET");
  const mfa = env("MFA_ENCRYPTION_KEY");
  check(
    randomEnough(jwt, 48, 10),
    "JWT_SECRET is long and random",
    "Use at least 48 random characters (npm run secrets:generate).",
  );
  check(
    randomEnough(code, 48, 10),
    "CODE_HMAC_SECRET is long and random",
    "Use at least 48 random characters (npm run secrets:generate).",
  );
  check(
    /^[0-9a-f]{64}$/i.test(mfa) && new Set(mfa).size >= 8,
    "MFA_ENCRYPTION_KEY is 64 random hex characters",
    "Generate one with npm run secrets:generate.",
  );
  check(
    new Set([jwt, code, mfa]).size === 3,
    "The three secrets are all different",
    "Never use the same value twice.",
  );
  check(
    !env("SEED_ADMIN_PASSWORD"),
    "SEED_ADMIN_PASSWORD is removed from .env",
    "The first administrator exists already. Delete the three SEED_ADMIN_ lines.",
    "WARN",
  );
}

function checkWeb() {
  head("Web address and HTTPS");
  const production = env("NODE_ENV") === "production";
  const origin = env("CLIENT_ORIGIN");
  check(production, "NODE_ENV is production", "Set NODE_ENV=production.");
  check(
    /^https:\/\//i.test(origin) && !/localhost|127\.0\.0\.1/i.test(origin),
    "CLIENT_ORIGIN is the real https:// address",
    "For example https://helpdesk.yourcompany.com.my (no slash at the end).",
  );
  check(
    env("APP_URL") === origin,
    "APP_URL equals CLIENT_ORIGIN",
    "Both must be the same address (APP_URL is used in emails).",
  );
  check(
    parseInt(env("TRUST_PROXY") || "0", 10) >= 1,
    "TRUST_PROXY is 1",
    "Set TRUST_PROXY=1 (Caddy runs in front of the API).",
  );
  check(
    env("REQUIRE_HTTPS").toLowerCase() !== "false",
    "REQUIRE_HTTPS is not turned off",
    "Remove REQUIRE_HTTPS=false.",
  );
  const bind = env("BIND_ADDRESS");
  check(
    bind === "127.0.0.1" || bind === "::1" || (bind === "" && production),
    "The API listens on this computer only",
    "Set BIND_ADDRESS=127.0.0.1 so only the proxy can reach it.",
  );
}

function checkDatabaseSettings() {
  head("Database settings");
  let url: URL | null = null;
  try {
    url = new URL(env("DATABASE_URL"));
  } catch {
    /* handled below */
  }
  if (!url) {
    fail(
      "DATABASE_URL is a valid address",
      "Use letters and digits only in the password, so nothing needs encoding.",
    );
    return;
  }
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  check(
    user !== "" && user !== "postgres",
    "The API connects with a limited role (not postgres)",
    "Use the helpdesk_app role.",
  );
  check(
    pass.length >= 14 && !looksLikeExample(pass),
    "The database password is strong",
    "At least 14 characters, and not an example from the guide.",
  );
  check(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "The database is on this computer",
    "A database on another computer needs a protected network link.",
    "WARN",
  );
}

function checkMail() {
  head("Email");
  check(
    !!env("SMTP_HOST") &&
      !looksLikeExample(env("SMTP_HOST")) &&
      !looksLikeExample(env("SMTP_PASS")),
    "Outgoing mail (SMTP) is set up",
    "Fill SMTP_HOST, SMTP_USER and SMTP_PASS with real values.",
  );
  check(
    !!env("POP3_HOST") &&
      !looksLikeExample(env("POP3_HOST")) &&
      !looksLikeExample(env("POP3_PASS")),
    "Incoming mail (POP3) is set up",
    "Fill POP3_HOST, POP3_USER and POP3_PASS with real values.",
    "WARN",
  );
  check(
    env("POP3_IGNORE_TLS_ERRORS").toLowerCase() !== "true",
    "The mail certificate is checked",
    "POP3_IGNORE_TLS_ERRORS=true turns a security check off.",
    "WARN",
  );
  check(
    env("POP3_PORT") !== "110" || env("POP3_TLS").toLowerCase() === "false",
    "The POP3 port and the TLS setting agree",
    "Port 995 needs POP3_TLS=true; port 110 needs POP3_TLS=false.",
  );
  const domains = env("ALLOWED_SENDER_DOMAINS");
  check(
    domains !== "" && !/example\.com/i.test(domains),
    "ALLOWED_SENDER_DOMAINS lists your real domains",
    "For example uoahospitality.com.my",
  );
}

function checkBackups() {
  head("Backups");
  const dir = env("BACKUP_DIR");
  if (!dir) {
    fail("BACKUP_DIR is set", 'See the README, section "Backups and restore".');
    return;
  }
  const abs = path.resolve(dir);
  const root = path.resolve(process.cwd(), "..");
  const rel = path.relative(root, abs);
  check(
    rel.startsWith("..") || path.isAbsolute(rel),
    "BACKUP_DIR is outside the project folder",
    "A backup inside the project could end up on GitHub.",
  );
  check(
    env("BACKUP_PASSPHRASE").length >= 16 &&
      !looksLikeExample(env("BACKUP_PASSPHRASE")),
    "BACKUP_PASSPHRASE is long (16+ characters)",
    "It protects the keys inside every backup.",
  );
  check(
    !!env("BACKUP_DATABASE_URL") &&
      !/\/\/postgres:/.test(env("BACKUP_DATABASE_URL")),
    "Backups use the read-only helpdesk_backup role",
    "Set BACKUP_DATABASE_URL with the helpdesk_backup role.",
  );
  check(
    !!env("BACKUP_ALERT_EMAIL"),
    "A failed backup sends an email (BACKUP_ALERT_EMAIL)",
    "Otherwise a failing backup goes unnoticed.",
    "WARN",
  );

  try {
    const status = JSON.parse(
      fs.readFileSync(path.join(abs, "last-backup.json"), "utf8"),
    ) as { ok: boolean; at: string; error?: string };
    const hours = (Date.now() - new Date(status.at).getTime()) / 3_600_000;
    if (!status.ok)
      fail(
        "The last backup succeeded",
        `It failed: ${status.error ?? "unknown reason"}`,
      );
    else if (hours > 30)
      fail(
        "A backup ran in the last 30 hours",
        `The last good backup is ${Math.round(hours)} hours old. Is the scheduled task running?`,
      );
    else ok(`The last backup is recent (${hours.toFixed(1)} hours ago)`);
  } catch {
    fail(
      "A backup has run",
      'Run "npm run backup" once, then schedule it (README, section 7).',
    );
  }
}

function checkFiles() {
  head("Files and folders");
  const uploads = path.resolve(process.cwd(), env("UPLOAD_DIR") || "./uploads");
  try {
    fs.mkdirSync(uploads, { recursive: true });
    const probe = path.join(uploads, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "x");
    fs.unlinkSync(probe);
    ok("The uploads folder is writable");
  } catch {
    fail(
      "The uploads folder is writable",
      `This account cannot write to ${uploads}.`,
    );
  }
  check(
    fs.existsSync(
      path.resolve(
        process.cwd(),
        env("CLIENT_DIST") || "../client/dist",
        "index.html",
      ),
    ),
    "The website is built (client/dist)",
    'Run "npm run build" in the client folder.',
  );
  check(
    fs.existsSync(path.resolve(process.cwd(), "dist", "index.js")),
    "The API is built (server/dist)",
    'Run "npm run build" in the server folder.',
    "WARN",
  );

  // The secrets file must never be tracked by Git
  const git = spawnSync("git", ["ls-files", "--", ".env"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (git.error || git.status !== 0)
    warn(
      ".env is not tracked by Git",
      "Git was not available, so this could not be checked.",
    );
  else
    check(
      git.stdout.trim() === "",
      ".env is not tracked by Git",
      "server/.env is in the repository! Remove it from Git and change EVERY secret in it.",
    );
}

async function checkDatabase() {
  head("Database");
  const pool = new Pool({
    connectionString: env("DATABASE_URL"),
    max: 1,
    connectionTimeoutMillis: 8000,
  });
  try {
    const me = await pool.query(
      `SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`,
    );
    ok(`Connected as ${me.rows[0].name}`);
    check(
      !me.rows[0].rolsuper &&
        !me.rows[0].rolcreatedb &&
        !me.rows[0].rolcreaterole,
      "The role has no administrator powers",
      "Run server/sql/hardening_db.sql and npm run dbcheck.",
    );

    const tables = await pool.query(
      `SELECT to_regclass('public.recovery_codes') IS NOT NULL AS has_recovery,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'department') AS has_department,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deleted_at') AS has_deleted,
              EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_update_delete' AND NOT tgisinternal) AS has_trigger,
              EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_ticket_id_fkey') AS has_audit_fk`,
    );
    const t = tables.rows[0];
    check(
      t.has_recovery,
      "The two-factor tables exist (migration_2fa.sql)",
      "Run server/sql/migration_2fa.sql.",
    );
    check(
      t.has_department && t.has_deleted,
      "The step I columns exist (migration_step_i.sql)",
      "Run server/sql/migration_step_i.sql.",
    );
    check(
      t.has_trigger,
      "The audit log is protected by its trigger",
      "The trigger is missing. Re-run schema.sql on a fresh database, or ask for help.",
    );
    check(
      !t.has_audit_fk,
      "The audit log is not tied to tickets (erasing works)",
      "Run server/sql/migration_step_i.sql.",
    );

    const admins = await pool.query(
      `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND is_active = TRUE AND deleted_at IS NULL`,
    );
    check(
      admins.rows[0].n >= 2,
      `There are ${admins.rows[0].n} active administrator(s)`,
      "Have at least two, so one lost phone cannot lock you out.",
      admins.rows[0].n >= 1 ? "WARN" : "FAIL",
    );
  } catch (err) {
    fail("The database can be reached and read", (err as Error).message);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function checkRuntime() {
  head("This computer");
  const major = parseInt(process.versions.node.split(".")[0], 10);
  check(
    major >= 20,
    `Node.js ${process.versions.node}`,
    "Install the current Node.js LTS (22 or newer).",
  );
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(
    `Helpdesk go-live check (reading ${path.resolve(process.cwd(), ".env")})\n`,
  );
  checkRuntime();
  checkSecrets();
  checkWeb();
  checkDatabaseSettings();
  checkMail();
  checkBackups();
  checkFiles();
  await checkDatabase();

  let fails = 0;
  let warns = 0;
  for (const row of rows) {
    if ("head" in row) {
      console.log(`\n${row.head}`);
      continue;
    }
    if (row.level === "FAIL") fails++;
    if (row.level === "WARN") warns++;
    const tag =
      row.level === "OK"
        ? "[ OK ]"
        : row.level === "WARN"
          ? "[WARN]"
          : "[FAIL]";
    console.log(`  ${tag} ${row.label}`);
    if (row.hint && row.level !== "OK") console.log(`         -> ${row.hint}`);
  }
  console.log(
    `\n${fails} failed, ${warns} warning(s).${fails === 0 ? " Ready, once you have read the warnings." : " Fix the [FAIL] lines first."}`,
  );
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((err: Error) => {
  console.error("The check itself failed:", err.message);
  process.exitCode = 1;
});
