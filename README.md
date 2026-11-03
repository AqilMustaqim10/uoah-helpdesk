# UOA Hospitality Enterprise IT Helpdesk

A web-based helpdesk for UOA Hospitality. Employees can submit and follow support tickets, while IT staff and administrators manage requests across business units.

## Features

- Ticket creation, assignment, priorities, statuses, replies, internal notes, and file attachments
- Priority-based SLA tracking with overdue alerts and dashboard compliance metrics
- IT dashboards, ticket history, audit logs, and PDF reports
- Searchable knowledge base with unit-specific and shared articles
- User, business-unit, department, and branding administration
- Email verification, password recovery, and optional two-factor authentication
- Optional email-to-ticket ingestion using a dedicated POP3 worker
- Optional AI reply suggestions using Groq

### Roles

| Role | Access |
| --- | --- |
| `USER` | Create tickets and view or reply to their own tickets and available knowledge-base articles |
| `IT` | Manage tickets for their business unit, use the dashboard and history, and manage permitted users and knowledge-base content |
| `ADMIN` | Manage users, departments, business units, audit logs, and system-wide tickets and settings |

## Technology

- **Client:** React, TypeScript, Vite, Tailwind CSS
- **Server:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Email:** SMTP for outgoing messages; POP3 for optional incoming-ticket ingestion

There is no root `package.json`. Install dependencies and run commands from the `client` or `server` directory as appropriate.

## Requirements

- Node.js and npm
- PostgreSQL 14 or newer
- A modern browser

PHP is only needed if you choose to use the optional Adminer/development launcher.

## Local setup (Windows)

The commands below use PowerShell and assume you are in the repository root.

### 1. Create the database and application role

Connect to PostgreSQL as an administrator:

```powershell
psql -U postgres
```

In the `psql` prompt, create a limited application role and an empty database. Replace the password with a strong password containing only letters and digits, then use the same value in `DATABASE_URL` below.

```sql
CREATE ROLE helpdesk_app LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE uoa_helpdesk;
\q
```

### 2. Create the schema and apply the current migrations

Run these commands from the repository root, using a PostgreSQL administrator account. Each migration is a one-time change; do not re-run it on a database where it has already been applied.

```powershell
psql -U postgres -d uoa_helpdesk -f server\sql\schema.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_step_i.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_2fa.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_departments.sql
psql -U postgres -d uoa_helpdesk -f server\sql\migration_kb_link.sql
```

The base schema already includes the audit-retention and business-unit audit changes, and grants the article permissions used by the app. The remaining migrations above add user deletion/departments, two-factor authentication, managed departments, and knowledge-base links on replies.

### 3. Configure the server

Install server dependencies and copy the example environment file:

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
```

Edit `server/.env` and set at least:

- `DATABASE_URL` — a PostgreSQL connection URI using the `helpdesk_app` username, `localhost` as the host, port `5432`, and `uoa_helpdesk` as the database. The URI format is `postgresql://` + username + `:` + password + `@` + host + `:` + port + `/` + database.
- `JWT_SECRET` and `CODE_HMAC_SECRET` — different, strong random values of at least 32 characters
- `MFA_ENCRYPTION_KEY` — exactly 64 hexadecimal characters (32 bytes)
- `ALLOWED_SENDER_DOMAINS` — comma-separated domains allowed to register and email the helpdesk

The secret-generation helper prints values for a new installation:

```powershell
npx tsx src/scripts/gensecrets.ts
```

Keep the generated secrets private. Do not replace `CODE_HMAC_SECRET` or `MFA_ENCRYPTION_KEY` on an existing installation: doing so invalidates recovery codes or makes saved authenticator secrets unreadable.

Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and `SEED_ADMIN_PASSWORD` in `server/.env` to create the first administrator. The password must be at least 10 characters, include a letter and a number, and fit bcrypt's 72-byte limit.

For signup verification, password recovery, and outgoing notifications, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. Incoming email is optional; configure `POP3_HOST`, `POP3_PORT`, `POP3_TLS`, `POP3_USER`, and `POP3_PASS` if you want to run the email worker. `GROQ_API_KEY` is also optional and enables AI reply suggestions.

### 4. Install and start the client

In a second PowerShell window, from the repository root:

```powershell
Set-Location client
npm install
npm run dev
```

The Vite development server runs at <http://localhost:5173> and proxies `/api` requests to the server on port 3000.

### 5. Seed the initial data and administrator

Before seeding, make sure the server environment and database are configured. From a PowerShell window in the `server` directory, run:

```powershell
npm run seed
```

This creates the default business units and, when the `SEED_ADMIN_*` settings are present, the first administrator account. Remove the seed password from `server/.env` after the account has been created.

### 6. Start the server

In another PowerShell window, from the repository root:

```powershell
Set-Location server
npm run dev
```

The API runs at <http://localhost:3000>. Check the database-backed health endpoint at <http://localhost:3000/api/health>.

Open <http://localhost:5173> to use the app. Keep the client and server terminals running while developing.

### Optional: start email ingestion

Only start the worker after configuring the POP3 mailbox and outgoing SMTP settings. From the `server` directory:

```powershell
npm run worker
```

The worker checks the mailbox at the configured interval. It is separate from the API and can be stopped with `Ctrl+C`.

## Useful commands

Run each command from its package directory.

| Directory | Command | Purpose |
| --- | --- | --- |
| `client` | `npm run build` | Type-check and create the production client build |
| `client` | `npm run typecheck` | Type-check the client |
| `server` | `npm run typecheck` | Type-check the server |
| `server` | `npm test` | Run the server security-scope test |
| `server` | `npm run seed` | Create default business units and the configured first administrator |
| `server` | `npm run worker` | Start the optional incoming-email worker |

## Production and operations

- Use HTTPS in production. Configure the deployment's trusted proxy and HTTPS settings in `server/.env`; see the comments in `server/.env.example`.
- To serve the built client from Express, build it with `npm run build` in `client`, then set `SERVE_CLIENT=true` in the server environment. Otherwise, serve the client and API through your deployment's web server/reverse proxy.
- Uploaded files are stored under `UPLOAD_DIR` (default `server/uploads`). Persist this directory alongside the database.
- The database hardening script is optional and intended for production. Review `server/sql/hardening_db.sql` before running it: it restricts database access to the application and backup roles and requires a separately created `helpdesk_backup` role.
- The backup script requires `BACKUP_DIR` to be outside the project, a read-only `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`, and PostgreSQL's `pg_dump`/`pg_restore` tools. Set `PG_BIN_DIR` if those tools are not on `PATH`. From `server`, run `npx tsx src/scripts/backup.ts` to create a backup.

Never commit `server/.env`, database credentials, generated secrets, or uploaded customer files.
