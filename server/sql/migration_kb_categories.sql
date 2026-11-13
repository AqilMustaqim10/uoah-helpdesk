-- Adds a required category to knowledge base articles. Existing articles use "other".
-- Run ONCE as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_kb_categories.sql
BEGIN;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('access_accounts','network_wifi','devices_printing',
    'email_collaboration','hospitality_systems','security_policies',
    'guides_howtos','other'));

COMMIT;
