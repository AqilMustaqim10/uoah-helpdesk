// Prints fresh random secrets. Run:  npm run secrets:generate
// Use them for a NEW installation. Do NOT replace the secrets of a running system without reading the README
// (section "Rotating secrets"): changing some of them makes data unreadable.
import crypto from "node:crypto";

const hex = (bytes: number) => crypto.randomBytes(bytes).toString("hex");
const urlSafe = (bytes: number) =>
  crypto.randomBytes(bytes).toString("base64url"); // letters, digits, - and _ only

console.log(`
Paste into server/.env (a NEW installation):

JWT_SECRET=${hex(48)}
CODE_HMAC_SECRET=${hex(48)}
MFA_ENCRYPTION_KEY=${hex(32)}
BACKUP_PASSPHRASE=${urlSafe(24)}

Passwords for the database roles (letters, digits, - and _ : nothing needs encoding in DATABASE_URL):

helpdesk_app     ${urlSafe(18)}
helpdesk_backup  ${urlSafe(18)}

WARNING for a system that is already running:
  JWT_SECRET          safe to change (everybody is signed out once)
  CODE_HMAC_SECRET    do NOT change: all recovery codes stop working
  MFA_ENCRYPTION_KEY  do NOT change: all authenticator secrets become unreadable (everyone must set up 2FA again)
Keep copies of the last two in your company password manager.
`);
