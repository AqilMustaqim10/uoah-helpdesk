-- Departments move from a fixed list in the code to a table that administrators manage in Settings.
-- Run ONCE as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_departments.sql
BEGIN;

CREATE TABLE departments (
  id          SMALLSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60 AND name !~ '[<>]'),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = hidden: not offered in forms; people who have it keep it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same name in different capitals counts as the same department
CREATE UNIQUE INDEX departments_name_key ON departments (lower(name));

-- The limited app role may read and change departments (nothing else is touched)
GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO helpdesk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helpdesk_app;

COMMIT;