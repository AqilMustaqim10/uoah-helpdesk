-- One active dashboard announcement per business unit.
-- Run ONCE as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_announcements.sql
BEGIN;

ALTER TABLE business_units
  ADD COLUMN IF NOT EXISTS announcement_text TEXT,
  ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ;

ALTER TABLE business_units
  ADD CONSTRAINT business_units_announcement_text_check
  CHECK (announcement_text IS NULL OR char_length(announcement_text) BETWEEN 1 AND 1000);

COMMIT;
