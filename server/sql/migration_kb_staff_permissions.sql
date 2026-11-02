-- Allow IT staff to publish global knowledge-base articles and manage their own posts.
-- Run ONCE as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_kb_staff_permissions.sql
BEGIN;

GRANT DELETE ON articles TO helpdesk_app;

COMMIT;
