# UOA Hospitality Enterprise IT Helpdesk

A multi-business-unit IT helpdesk: tickets with attachments and screenshots, email in and out, a knowledge base with
suggestions, a dashboard with trends, PDF reports, a user directory, branding per business unit, an audit log,
and two-factor authentication for IT staff and administrators.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 (website) · Node.js + Express + TypeScript (API) · PostgreSQL.

---

## 1. Project layout

```
uoah-helpdesk/
├─ README.md
├─ client/                  the website (React)
│  ├─ public/theme-init.js
│  └─ src/  api/ components/ context/ hooks/ lib/ pages/ types/
└─ server/                  the API, the email worker and the tools
   ├─ .env                  YOUR SECRETS (never committed; copy .env.example)
   ├─ sql/                  schema.sql, migration_2fa.sql, migration_step_i.sql, hardening_db.sql
   ├─ uploads/              uploaded files (never committed; BACK IT UP)
   ├─ fonts/report.ttf      optional: a font for PDFs with Chinese or other languages
   └─ src/
      ├─ config/            env.ts (settings), constants.ts, departments.ts (EDIT THIS LIST)
      ├─ security/          scope.ts: who may see which ticket or article
      ├─ middleware/        auth, rate limits, origin check, web.ts (headers, HTTPS, website)
      ├─ routes/            one file per part of the API
      ├─ services/          mail, uploads, PDF, notifications, shared queries
      ├─ ingest/            the email worker (POP3)
      ├─ lib/               validation, 2FA codes, backup tools
      └─ scripts/           seed, backup, preflight, sitecheck, dbcheck, tests ...
```

## 2. Requirements

- Node.js 22 LTS (20.19 or newer works), Git
- PostgreSQL 14 or newer (16 recommended)
- An SMTP account (outgoing mail) and a **dedicated** POP3 mailbox for the helpdesk
- For production: **NSSM** (Windows services) and **Caddy** (HTTPS), both free

## 3. Run it on your own computer (development)

```powershell
# Database (once). Use letters and digits only in passwords.
psql -U postgres -c "CREATE DATABASE uoa_helpdesk;"
psql -U postgres -c "CREATE ROLE helpdesk_app LOGIN PASSWORD 'ChooseAStrongPassword1';"
psql -U postgres -d uoa_helpdesk -f server\sql\schema.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_2fa.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_step_i.sql

# API
cd server
copy .env.example .env          # then edit .env (npm run secrets:generate gives you secrets)
npm install
npm run seed                    # creates the 6 business units and the first administrator
npm run dev                     # window 1

# Email worker (window 2, in the server folder)
npm run worker

# Website (window 3)
cd ..\client
npm install
npm run dev                     # open http://localhost:5173
```

The first administrator signs in with the `SEED_ADMIN_*` values and sets up an authenticator app.
Afterwards delete the three `SEED_ADMIN_` lines from `.env`.

Open the website at **exactly** the address in `CLIENT_ORIGIN`. A different address (the computer's IP address,
for example) gets "Request blocked".

## 4. Settings reference (`server/.env`)

| Setting                             | Meaning                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development` or `production`. Production turns on the strict checks, secure cookies and HSTS. |
| `PORT`, `BIND_ADDRESS`              | The API port (3000). In production it listens on `127.0.0.1` only.                             |
| `CLIENT_ORIGIN`, `APP_URL`          | The address people type, no slash at the end. In production `https://...`. Both the same.      |
| `TRUST_PROXY`                       | `1` when Caddy/IIS/nginx stands in front of the API (production). `0` otherwise.               |
| `REQUIRE_HTTPS`, `SERVE_CLIENT`     | Production defaults are `true`. The API then also serves the built website.                    |
| `DATABASE_URL`                      | The limited `helpdesk_app` role. Never `postgres`.                                             |
| `JWT_SECRET`                        | Signs the login cookie.                                                                        |
| `CODE_HMAC_SECRET`                  | Protects the recovery codes and the emailed codes.                                             |
| `MFA_ENCRYPTION_KEY`                | 64 hex characters. Encrypts the authenticator secrets.                                         |
| `ALLOWED_SENDER_DOMAINS`            | Only these email domains can register, be added, or get replies by email.                      |
| `SMTP_*`, `MAIL_FROM`               | Outgoing mail. `SMTP_SECURE=true` for port 465, `false` for 587.                               |
| `POP3_*`, `INGEST_INTERVAL_SECONDS` | The helpdesk mailbox and how often it is checked (10 seconds or more).                         |
| `BACKUP_*`, `PG_BIN_DIR`            | See section 7.                                                                                 |

## 5. Roles and rules

|                                                | USER           | IT                             | ADMIN                                                                  |
| ---------------------------------------------- | -------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Tickets                                        | own tickets    | all tickets of own unit        | all tickets                                                            |
| Change status, priority, assignee, due date    | no             | yes                            | yes                                                                    |
| Internal notes, history, dashboard, PDF export | no             | yes                            | yes                                                                    |
| Delete a ticket (permanent, needs a reason)    | no             | own unit                       | any                                                                    |
| Knowledge base                                 | read published | write for own unit             | write anywhere                                                         |
| User directory                                 | no             | users of own unit: add, delete | everyone: add, change role/unit/department, disable, delete, reset 2FA |
| Settings (branding), audit log                 | no             | no                             | yes                                                                    |
| Two-factor authentication                      | no             | required                       | required                                                               |

Other rules: priority of a USER's ticket is always Medium. Closed tickets are read-only. The audit log can never be
edited or deleted (a database trigger enforces it). Deleting a ticket or a user is **permanent**.

## 6. Going live (Windows server)

Assumed folder: `C:\helpdesk`. Use your own path if you prefer.

### 6.1 Database

```powershell
psql -U postgres -c "CREATE DATABASE uoa_helpdesk;"
psql -U postgres -c "CREATE ROLE helpdesk_app LOGIN PASSWORD '<password from npm run secrets:generate>';"
psql -U postgres -c "CREATE ROLE helpdesk_backup LOGIN PASSWORD '<another password>';"
psql -U postgres -d uoa_helpdesk -f server\sql\schema.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_2fa.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_step_i.sql
psql -U postgres -d uoa_helpdesk -f server\sql\hardening_db.sql
```

Also make sure PostgreSQL only listens on this computer (`listen_addresses = 'localhost'` in `postgresql.conf`) and that
the `postgres` administrator has a long password that is not used anywhere else.

### 6.2 Secrets and settings

```powershell
cd C:\helpdesk\server
copy .env.example .env
npm run secrets:generate        # copy the values into .env
```

Fill in `.env` using the production settings from section 4. Then:

```powershell
npm install
npm run seed                    # first administrator; delete the SEED_ADMIN_ lines afterwards
```

### 6.3 Build

```powershell
cd C:\helpdesk\server ; npm run typecheck ; npm run build
cd C:\helpdesk\client ; npm install ; npm run build
```

### 6.4 Run the API and the email worker as Windows services (NSSM)

```powershell
mkdir C:\helpdesk\server\logs
nssm install HelpdeskApi "C:\Program Files\nodejs\node.exe" dist\index.js
nssm set HelpdeskApi AppDirectory C:\helpdesk\server
nssm set HelpdeskApi AppEnvironmentExtra NODE_ENV=production
nssm set HelpdeskApi AppStdout C:\helpdesk\server\logs\api.log
nssm set HelpdeskApi AppStderr C:\helpdesk\server\logs\api.log
nssm set HelpdeskApi AppRotateFiles 1
nssm set HelpdeskApi AppRotateBytes 10485760
nssm set HelpdeskApi Start SERVICE_AUTO_START

nssm install HelpdeskWorker "C:\Program Files\nodejs\node.exe" dist\ingest\worker.js
nssm set HelpdeskWorker AppDirectory C:\helpdesk\server
nssm set HelpdeskWorker AppEnvironmentExtra NODE_ENV=production
nssm set HelpdeskWorker AppStdout C:\helpdesk\server\logs\worker.log
nssm set HelpdeskWorker AppStderr C:\helpdesk\server\logs\worker.log
nssm set HelpdeskWorker AppRotateFiles 1
nssm set HelpdeskWorker AppRotateBytes 10485760
nssm set HelpdeskWorker Start SERVICE_AUTO_START

nssm start HelpdeskApi
nssm start HelpdeskWorker
```

Better: run both under a dedicated Windows account with no other rights
(`nssm set HelpdeskApi ObjectName .\svc-helpdesk <password>`); it needs full access to `C:\helpdesk\server\uploads`
and `logs`, and read access to the rest. On Linux use a `systemd` service with `WorkingDirectory=/opt/helpdesk/server`
and `ExecStart=/usr/bin/node dist/index.js`.

### 6.5 HTTPS (Caddy)

Create `C:\caddy\Caddyfile`. Choose **one** of the three versions.

```
# A) Your IT team gives you a certificate and a key (most common inside a company)
helpdesk.yourcompany.com.my {
    tls C:\certs\helpdesk.crt C:\certs\helpdesk.key
    encode gzip
    reverse_proxy 127.0.0.1:3000
}

# B) A public address on the internet: delete the "tls" line and Caddy gets a free Let's Encrypt certificate
#    by itself (ports 80 and 443 must be reachable from the internet, and the DNS name must point here).

# C) Testing on one computer only: Caddy makes its own certificate
#    localhost {
#        tls internal
#        reverse_proxy 127.0.0.1:3000
#    }
#    then run "caddy trust" once, and set CLIENT_ORIGIN=https://localhost in .env
```

Run Caddy as a service:

```powershell
nssm install Caddy "C:\caddy\caddy.exe" "run --config C:\caddy\Caddyfile"
nssm set Caddy Start SERVICE_AUTO_START
nssm start Caddy
```

Use `127.0.0.1`, not `localhost`, in the Caddyfile (Windows may resolve `localhost` to IPv6).
Caddy redirects http to https by itself and adds the `X-Forwarded-Proto` header the API relies on.
Using IIS or nginx instead is fine: they must forward `X-Forwarded-Proto` and `X-Forwarded-For`.

### 6.6 Firewall

Open only ports **80** and **443**. Never open 3000 (the API) or 5432 (the database).

### 6.7 Check everything

```powershell
cd C:\helpdesk\server
npm run preflight                                         # settings, secrets, files, database
npm run dbcheck                                           # what the database role can and cannot do
npx tsx src\scripts\sitecheck.ts https://helpdesk.yourcompany.com.my   # the live site, from outside
```

Every `[FAIL]` must be fixed. Then walk through section 9.

## 7. Backups and restore

**What is backed up each night:** the database, the `uploads` folder, and an encrypted file with the two keys that the
database cannot be read without (`MFA_ENCRYPTION_KEY` and `CODE_HMAC_SECRET`). The encrypted keys are protected by
`BACKUP_PASSPHRASE`. **Store that passphrase in your company password manager**: without it the keys cannot be opened.

**Set up**

```powershell
# settings in server\.env: BACKUP_DIR (another disk or a network share, NOT inside the project),
# BACKUP_KEEP_DAYS, BACKUP_DATABASE_URL (helpdesk_backup role), BACKUP_PASSPHRASE, BACKUP_ALERT_EMAIL, PG_BIN_DIR
cd C:\helpdesk\server
npm run backup                  # try it once by hand
schtasks /Create /TN "Helpdesk nightly backup" /SC DAILY /ST 02:00 /RU SYSTEM /RL HIGHEST /TR "C:\helpdesk\server\run-backup.cmd"
schtasks /Run /TN "Helpdesk nightly backup"
```

The account that runs the task needs read access to `uploads` and `.env`, and write access to `BACKUP_DIR`.
A failed backup sends an email to `BACKUP_ALERT_EMAIL`, and `npm run preflight` reports the last result.

**Good habits**

- Once a month, copy the newest backup folder to a disk that is kept elsewhere (offline).
- Backups hold the data of tickets you erased until they expire (`BACKUP_KEEP_DAYS`, 14 by default).
- Every three months, do a **test restore** (below), because an untested backup is only a hope.

**Restore everything onto a new server**

1. Install PostgreSQL, Node.js and this project. Create the roles `helpdesk_app` and `helpdesk_backup`.
2. `psql -U postgres -c "CREATE DATABASE uoa_helpdesk;"`
3. `pg_restore -U postgres -d uoa_helpdesk "D:\HelpdeskBackups\helpdesk-YYYY-MM-DD_HHMM\database.dump"`
   (a message that the schema "public" already exists can be ignored; stop and ask for anything else)
4. Copy the backup's `uploads\` contents into `server\uploads\`.
5. Get the two keys back: `npx tsx src\scripts\restorekeys.ts "D:\HelpdeskBackups\helpdesk-YYYY-MM-DD_HHMM\keys.enc"`
   and put the two printed lines into the new `server\.env`. Fill in the other settings from your records.
   The keys must be the old ones, or authenticator codes and recovery codes will not work.
6. Start the services, then run `npm run dbcheck` and `npm run preflight`.

**Test restore (safe: uses a scratch database)**

```powershell
psql -U postgres -c "CREATE DATABASE uoa_restore_test;"
pg_restore -U postgres -d uoa_restore_test "D:\HelpdeskBackups\helpdesk-YYYY-MM-DD_HHMM\database.dump"
psql -U postgres -d uoa_restore_test -c "SELECT (SELECT count(*) FROM tickets) AS tickets, (SELECT count(*) FROM users) AS users;"
psql -U postgres -c "DROP DATABASE uoa_restore_test;"
```

Compare the numbers with the live system, and open one file from `uploads` of the same backup.

## 8. Security model (in short)

- **Every permission is enforced on the server.** The screens only hide buttons. Anything out of scope answers "not found".
- **One function decides ticket visibility** (`security/scope.ts`), and every ticket query, statistic, export, file and comment uses it.
- **Sessions:** the cookie holds only the user id (HttpOnly, SameSite=Lax, Secure in production). Role, unit and
  active status are read from the database on every request. A password change, a disable, or a 2FA reset ends sessions.
- **Two-factor authentication** (authenticator app + one-time recovery codes) is required for IT and administrators.
  Authenticator secrets are encrypted in the database with `MFA_ENCRYPTION_KEY`.
- **All SQL is parameterized.** All input is validated and length-limited. Emails never carry unescaped user text.
- **Uploads:** only JPG, PNG, GIF, WebP and PDF, detected from the file's real bytes; random stored names; size limits;
  served only through checked routes with `nosniff`. Files are **not** virus-scanned: keep antivirus running on the server.
- **The audit log is append-only** (database trigger) and records every important action, including who deleted what and why.
- **Database role:** the API connects as `helpdesk_app`, which cannot delete users, change the audit log, or alter the schema.
- **Network:** HTTPS only (HSTS), strict Content-Security-Policy, rate limits on sign-in and codes, the API reachable only
  through the proxy.

## 9. Final security checklist (tick every box before go-live)

**Secrets and settings**

- [ ] `npm run preflight` shows no `[FAIL]`, and every `[WARN]` is understood
- [ ] `JWT_SECRET`, `CODE_HMAC_SECRET`, `MFA_ENCRYPTION_KEY` are random, different, and copied into the password manager
- [ ] `server/.env` is not in Git (`git ls-files server/.env` prints nothing), and the SEED*ADMIN* lines are removed
- [ ] Database, SMTP and POP3 passwords are strong and not used elsewhere; the `postgres` password is long

**Database**

- [ ] `hardening_db.sql` was run, and `npm run dbcheck` shows no `[FAIL]`
- [ ] PostgreSQL listens on localhost only, and port 5432 is blocked in the firewall

**HTTPS and the server**

- [ ] The site opens on `https://...`, `http://...` redirects, and `sitecheck.ts` shows no `[FAIL]`
- [ ] The certificate is valid and its renewal date is in someone's calendar
- [ ] Only ports 80 and 443 are open; the API port 3000 is not reachable from another computer
- [ ] The API and the worker run as services that restart by themselves (test: end the node process, it comes back)
- [ ] In the browser: cookie `uoa_session` is Secure and HttpOnly; no red "Refused to load..." messages on any page

**Accounts**

- [ ] At least two administrators, each with two-factor authentication on and recovery codes saved
- [ ] IT staff were added by an administrator or registered, and each has a business unit
- [ ] `ALLOWED_SENDER_DOMAINS` lists only your real email domains

**Behaviour (try each once with a normal user, an IT user and an administrator)**

- [ ] A user cannot open another user's ticket, file or article (answer: "not found")
- [ ] IT cannot open a ticket of another unit; a USER cannot see internal notes
- [ ] A wrong password 11 times blocks only that computer, not everyone
- [ ] Deleting a ticket or a user asks for a reason, and the audit log shows it
- [ ] The PDF export of an IT user contains only their own unit

**Backups**

- [ ] The nightly task ran, a new folder appears every day, and a failed run sends an email
- [ ] A test restore worked, and the keys file opens with the passphrase (`restorekeys.ts`)
- [ ] A copy of a recent backup is kept offline, and the backup folder is not readable by ordinary users

## 10. Routine maintenance

**Update the system**

```powershell
nssm stop HelpdeskWorker ; nssm stop HelpdeskApi
cd C:\helpdesk\server ; npm run backup
git pull
npm install ; npm run typecheck ; npm run build
cd ..\client ; npm install ; npm run build
# run any new file in server\sql\ that the update mentions (once)
cd ..\server ; nssm start HelpdeskApi ; nssm start HelpdeskWorker
npm run preflight
```

Every month run `npm audit --omit=dev` in both folders and update packages that have known problems.

**Rotating secrets**

| Secret                           | Can I change it? | What happens                                                                                                                                                           |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                     | Yes              | Everybody is signed out once.                                                                                                                                          |
| `CODE_HMAC_SECRET`               | Avoid            | All recovery codes stop working; pending emailed codes are void.                                                                                                       |
| `MFA_ENCRYPTION_KEY`             | Avoid            | All authenticator secrets become unreadable: every IT and administrator account must be reset (`npx tsx src\scripts\reset2fa.ts person@company.com`) and set up again. |
| Database / SMTP / POP3 passwords | Yes              | Change them in the service first, then in `.env`, then restart the API and the worker.                                                                                 |

**Common tasks**

- Change the departments: edit `server/src/config/departments.ts`, run `npm run build`, restart `HelpdeskApi`.
- Someone lost their phone: User Directory, **Reset 2FA** (or the `reset2fa.ts` script if no administrator can sign in).
- An account is locked after wrong codes: it unlocks by itself after 15 minutes.
- Logs: `server\logs\api.log`, `worker.log`, `backup.log`.

## 11. Troubleshooting

| Message or symptom                                            | Cause and fix                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "Request blocked" when signing in                             | The address in the browser differs from `CLIENT_ORIGIN`. The API window prints both.                    |
| The API refuses to start in production                        | It lists what is wrong (https address, `TRUST_PROXY`, secrets, database role).                          |
| Endless redirects to https                                    | `TRUST_PROXY=1` is missing, or the proxy does not send `X-Forwarded-Proto`.                             |
| Everybody shares one "too many attempts" limit                | Same cause: `TRUST_PROXY` is missing, so every visitor looks like the proxy.                            |
| A page is blank and the browser console says "Refused to ..." | The Content-Security-Policy blocked something. Send me the first console line.                          |
| `pg_dump was not found`                                       | Set `PG_BIN_DIR` to the PostgreSQL `bin` folder.                                                        |
| The backup folder is "inside the project"                     | Move `BACKUP_DIR` to another disk or share.                                                             |
| Tickets by email stopped                                      | See `worker.log`: usually a changed mailbox password. The worker retries by itself with growing pauses. |
| Authenticator codes are refused                               | The clocks differ. Turn on automatic time on the server and on the phone.                               |

## 12. Known limits

- Passwords are rate-limited per computer address, not per account. IT and administrators are protected by two-factor authentication.
- Email checking uses POP3, so new mail appears within the check interval (10 seconds), not instantly.
- Uploaded files are not scanned for viruses. Email attachments are not opened by the helpdesk.
- PDF reports show the newest 2,000 tickets. Non-Latin text needs `server/fonts/report.ttf`.
- Ideas not built: WhatsApp alerts, an AI assistant, satisfaction ratings, an asset register.
