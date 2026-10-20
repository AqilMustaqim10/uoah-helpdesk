-- Step I: department on users, and permanent erasing of tickets. Run ONCE as the postgres user.
BEGIN;

-- Department for every person (existing people keep an empty one until an administrator sets it)
-- deleted_at marks an account that was anonymized by "delete user"; those accounts are hidden everywhere.
ALTER TABLE users
  ADD COLUMN department  TEXT CHECK (department IS NULL OR char_length(department) BETWEEN 2 AND 60),
  ADD COLUMN deleted_at  TIMESTAMPTZ;

-- Erasing a ticket removes its row. The audit log must keep ITS rows (append-only), so it can no
-- longer be linked to tickets; the ticket number stays in the log as a plain number.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_ticket_id_fkey;

-- The limited app role may now delete tickets and replies (never audit rows: the trigger still blocks that)
GRANT DELETE ON tickets, comments TO helpdesk_app;

COMMIT;