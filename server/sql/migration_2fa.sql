-- Two-factor authentication: new columns on users and a table for recovery codes.
-- Run ONCE as the postgres user.
BEGIN;

ALTER TABLE users
  ADD COLUMN totp_secret_enc   TEXT,                       -- the authenticator secret, ENCRYPTED (never plain text)
  ADD COLUMN totp_enabled_at   TIMESTAMPTZ,                -- NULL = not turned on (a secret may be waiting for its first code)
  ADD COLUMN totp_last_step    BIGINT,                     -- the last 30-second step that was accepted (a code cannot be reused)
  ADD COLUMN mfa_failed_count  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN mfa_locked_until  TIMESTAMPTZ;                -- after 5 wrong codes: locked for 15 minutes

CREATE TABLE recovery_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  code_hash   TEXT NOT NULL UNIQUE,                        -- keyed hash, never the code itself
  used_at     TIMESTAMPTZ,                                 -- set when the code has been used
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id) WHERE used_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON recovery_codes TO helpdesk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helpdesk_app;

COMMIT;