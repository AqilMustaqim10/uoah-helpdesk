// Reads and checks every setting from the env file.
// Supports DOTENV_CONFIG_PATH so UAT / PROD can use different files.
import dotenv from "dotenv";
import path from "node:path";

// Load the file indicated by DOTENV_CONFIG_PATH (or fall back to .env)
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
    : path.resolve(process.cwd(), ".env"),
});

/** A setting that MUST exist. Stops the program with a friendly message if missing. */
function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(
      `\nMissing setting ${name} in the environment file. Open the correct .env.* file and fill it in.\n`,
    );
    process.exit(1);
  }
  return v.trim();
}

/** A setting that may be empty; uses a fallback value instead. */
function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

/** Reads a whole number setting (like PORT). */
function intOf(name: string, fallback: number): number {
  const n = parseInt(optional(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = optional("NODE_ENV", "development");
const isProd = nodeEnv === "production";
const clientOrigins = optional("CLIENT_ORIGIN", "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const requireHttps =
  optional("REQUIRE_HTTPS", isProd ? "true" : "false") === "true";
const jwtSecret = required("JWT_SECRET");
const codeSecret = required("CODE_HMAC_SECRET");
const mfaKey = required("MFA_ENCRYPTION_KEY");

// Secrets must be long, not left as the placeholder, and different from each other.
for (const [name, val] of [
  ["JWT_SECRET", jwtSecret],
  ["CODE_HMAC_SECRET", codeSecret],
] as const) {
  if (val.length < 32 || /PASTE_A|change_?me/i.test(val)) {
    console.error(
      `\n${name} is too short or still the placeholder. Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"\n`,
    );
    process.exit(1);
  }
}
if (jwtSecret === codeSecret) {
  console.error(
    "\nJWT_SECRET and CODE_HMAC_SECRET must be different values.\n",
  );
  process.exit(1);
}

// The key that encrypts the authenticator secrets: exactly 32 bytes = 64 hex characters
if (!/^[0-9a-fA-F]{64}$/.test(mfaKey)) {
  console.error(
    "\nMFA_ENCRYPTION_KEY must be exactly 64 hex characters (0-9 and a-f). Generate one with:\n" +
      `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n`,
  );
  process.exit(1);
}

/** All settings in one place. Other files import { config } from this file. */
export const config = {
  nodeEnv,
  isProd,
  port: intOf("PORT", 3001),
  bindAddress: optional("BIND_ADDRESS", "0.0.0.0"),
  trustProxy:
    optional("TRUST_PROXY", isProd ? "1" : "0") === "1" ||
    optional("TRUST_PROXY", "0") === "true",
  clientOrigin: clientOrigins[0] ?? "http://localhost:3000",
  clientOrigins,
  requireHttps,
  serveClient: optional("SERVE_CLIENT", "false") === "true",
  clientDist: path.resolve(
    process.cwd(),
    optional("CLIENT_DIST", "../client/dist"),
  ),
  appUrl: optional("APP_URL", "http://localhost:3000").replace(/\/+$/, ""),
  databaseUrl: required("DATABASE_URL"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  geminiPriorityApiKey: optional("GEMINI_PRIORITY_API_KEY"),
  geminiModel: optional("GEMINI_MODEL", "gemini-3.5-flash-lite"),
  jwtSecret,
  codeSecret,
  mfaKey: mfaKey.toLowerCase(),
  allowedDomains: optional("ALLOWED_SENDER_DOMAINS")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  uploadDir: path.resolve(process.cwd(), optional("UPLOAD_DIR", "./uploads")),
  smtp: {
    host: optional("SMTP_HOST"),
    port: intOf("SMTP_PORT", 587),
    secure: optional("SMTP_SECURE", "false") === "true",
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
    from: optional("MAIL_FROM"),
  },
  pop3: {
    host: optional("POP3_HOST"),
    port: intOf("POP3_PORT", 995),
    tls: optional("POP3_TLS", "true") === "true",
    user: optional("POP3_USER"),
    pass: optional("POP3_PASS"),
  },
  ingestIntervalSeconds: Math.max(10, intOf("INGEST_INTERVAL_SECONDS", 10)),
  seed: {
    email: optional("SEED_ADMIN_EMAIL").toLowerCase(),
    name: optional("SEED_ADMIN_NAME", "Administrator"),
    password: optional("SEED_ADMIN_PASSWORD"),
  },
} as const;

if (config.allowedDomains.length === 0) {
  console.warn(
    "WARNING: ALLOWED_SENDER_DOMAINS is empty, so nobody can register.",
  );
}
