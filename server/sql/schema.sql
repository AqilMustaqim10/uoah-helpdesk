-- =====================================================================
-- UOA Hospitality Enterprise IT Helpdesk: database schema
-- Run AFTER creating the role helpdesk_app (see setup steps).
-- Everything runs in ONE transaction: if any line fails, nothing is created.
-- =====================================================================
BEGIN;

-- ---------- Business units (CCEC, FNB, HOTEL, KLBS, KLW, HQ) ----------
-- Also stores the branding (logo, color, display text) for each unit.
CREATE TABLE business_units (
  id            SMALLSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE
                CHECK (code IN ('CCEC','FNB','HOTEL','KLBS','KLW','HQ')),
  name          TEXT NOT NULL,
  logo_file     TEXT,                                   -- random stored file name (not the original)
  logo_mime     TEXT CHECK (logo_mime IS NULL OR logo_mime IN ('image/png','image/jpeg','image/webp')),
  logo_version  INTEGER NOT NULL DEFAULT 0,             -- bumps on each upload so browsers refresh the logo
  brand_color   TEXT NOT NULL DEFAULT '#2563EB'         -- blue-600 by default
                CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  brand_text    TEXT NOT NULL                           -- 2-40 chars, no < or >
                CHECK (char_length(brand_text) BETWEEN 2 AND 40 AND brand_text !~ '[<>]'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Users ----------
CREATE TABLE users (
  id                   BIGSERIAL PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE
                       CHECK (email = lower(email) AND char_length(email) <= 254),
  name                 TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  password_hash        TEXT NOT NULL,                   -- bcrypt hash, never the real password
  role                 TEXT NOT NULL DEFAULT 'USER'
                       CHECK (role IN ('ADMIN','IT','USER')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = disabled (we never delete users)
  business_unit_id     SMALLINT REFERENCES business_units(id),
  password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- sessions older than this are rejected
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_unit_idx        ON users (business_unit_id);
CREATE INDEX users_role_active_idx ON users (role, is_active);

-- ---------- Tickets (shown in the app as HD-<id>) ----------
CREATE TABLE tickets (
  id                BIGSERIAL PRIMARY KEY,
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description       TEXT NOT NULL CHECK (char_length(description) <= 20000),
  raw_body          TEXT,                                -- original email text before cleaning
  status            TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  priority          TEXT NOT NULL DEFAULT 'MEDIUM'
                    CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  business_unit_id  SMALLINT NOT NULL REFERENCES business_units(id),
  created_by        BIGINT NOT NULL REFERENCES users(id),
  requester_email   TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB','EMAIL')),
  assigned_to       BIGINT REFERENCES users(id),
  due_at            TIMESTAMPTZ,                         -- manual due date (optional)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);
CREATE INDEX tickets_unit_status_idx ON tickets (business_unit_id, status);
CREATE INDEX tickets_created_by_idx  ON tickets (created_by);
CREATE INDEX tickets_assigned_idx    ON tickets (assigned_to);
CREATE INDEX tickets_status_prio_idx ON tickets (status, priority);
CREATE INDEX tickets_created_at_idx  ON tickets (created_at DESC);

-- ---------- Comments (public replies and internal notes) ----------
CREATE TABLE comments (
  id           BIGSERIAL PRIMARY KEY,
  ticket_id    BIGINT NOT NULL REFERENCES tickets(id),
  author_id    BIGINT NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  raw_body     TEXT,                                     -- original email text before cleaning
  is_internal  BOOLEAN NOT NULL DEFAULT FALSE,           -- TRUE = internal note, hidden from USER
  source       TEXT NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB','EMAIL')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_ticket_idx ON comments (ticket_id, created_at);

-- ---------- Ticket attachments (can belong to the ticket or to one comment) ----------
CREATE TABLE ticket_files (
  id             BIGSERIAL PRIMARY KEY,
  ticket_id      BIGINT NOT NULL REFERENCES tickets(id),
  comment_id     BIGINT REFERENCES comments(id),         -- NULL = attached to the ticket itself
  uploaded_by    BIGINT NOT NULL REFERENCES users(id),
  original_name  TEXT NOT NULL CHECK (char_length(original_name) <= 255),
  stored_name    TEXT NOT NULL UNIQUE,                   -- random name on disk
  mime           TEXT NOT NULL                           -- detected from file contents, not the name
                 CHECK (mime IN ('image/jpeg','image/png','image/gif','image/webp','application/pdf')),
  size_bytes     INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_files_ticket_idx ON ticket_files (ticket_id);

-- ---------- Audit log (append-only history of important actions) ----------
CREATE TABLE audit_log (
  id                BIGSERIAL PRIMARY KEY,
  actor_id          BIGINT REFERENCES users(id),          -- NULL = system / email worker
  ticket_id         BIGINT REFERENCES tickets(id),
  business_unit_id  SMALLINT REFERENCES business_units(id),
  entity_type       TEXT NOT NULL,                        -- ticket | comment | user | unit | article | file
  entity_id         TEXT NOT NULL,
  action            TEXT NOT NULL,                        -- e.g. TICKET_STATUS_CHANGED
  details           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_ticket_idx ON audit_log (ticket_id, created_at);
CREATE INDEX audit_actor_idx  ON audit_log (actor_id, created_at);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_business_unit_idx ON audit_log (business_unit_id);

-- This function simply refuses any change. The triggers below call it.
CREATE FUNCTION audit_log_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;

-- Block UPDATE and DELETE on every row
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

-- Block TRUNCATE (wipe whole table)
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_changes();

-- ---------- Email ingestion bookkeeping ----------
-- One row per mailbox message already handled (UIDL = the mail server's unique id).
-- The UNIQUE constraint guarantees a message is never processed twice.
CREATE TABLE processed_messages (
  id          BIGSERIAL PRIMARY KEY,
  uidl        TEXT NOT NULL UNIQUE,
  outcome     TEXT NOT NULL CHECK (outcome IN (
                'BASELINE','IGNORED_AUTO','COMMENT_ADDED','TICKET_CREATED',
                'UNKNOWN_REJECTED','UNKNOWN_IGNORED','ERROR_SKIPPED')),
  ticket_id   BIGINT REFERENCES tickets(id),
  from_email  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Remembers when we last sent a "please register" rejection (max one per 24 h per address)
CREATE TABLE email_rejections (
  email         TEXT PRIMARY KEY,
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6-digit codes for sign up and password reset ----------
CREATE TABLE email_codes (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('SIGNUP','RESET')),
  code_hash   TEXT NOT NULL,                             -- HMAC hash, never the code itself
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,        -- pending sign-up data (name, password hash, unit)
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,               -- max 5 wrong tries
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_lookup_idx ON email_codes (email, purpose, created_at DESC);

-- ---------- Knowledge base ----------
CREATE TABLE articles (
  id                BIGSERIAL PRIMARY KEY,
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  body              TEXT NOT NULL CHECK (char_length(body) <= 50000),
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  tags              TEXT[] NOT NULL DEFAULT '{}',
  business_unit_id  SMALLINT REFERENCES business_units(id),   -- NULL = global (all units)
  created_by        BIGINT NOT NULL REFERENCES users(id),
  updated_by        BIGINT NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX articles_unit_status_idx ON articles (business_unit_id, status);
CREATE INDEX articles_tags_idx        ON articles USING GIN (tags);

CREATE TABLE article_files (
  id             BIGSERIAL PRIMARY KEY,
  article_id     BIGINT NOT NULL REFERENCES articles(id),
  uploaded_by    BIGINT NOT NULL REFERENCES users(id),
  original_name  TEXT NOT NULL CHECK (char_length(original_name) <= 255),
  stored_name    TEXT NOT NULL UNIQUE,
  mime           TEXT NOT NULL
                 CHECK (mime IN ('image/jpeg','image/png','image/gif','image/webp','application/pdf')),
  size_bytes     INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX article_files_article_idx ON article_files (article_id);

-- ---------- Permissions for the limited app role ----------
-- The app connects as helpdesk_app, which can only do what is listed here.
GRANT SELECT, INSERT, UPDATE ON business_units, users, tickets, comments,
      articles, processed_messages TO helpdesk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_codes, email_rejections,
      ticket_files, article_files TO helpdesk_app;
GRANT SELECT, INSERT ON audit_log TO helpdesk_app;     -- no UPDATE/DELETE, ever
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helpdesk_app;

COMMIT;