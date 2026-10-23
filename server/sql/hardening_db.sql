-- Database hardening for the helpdesk. Run ONCE as the postgres user, AFTER creating the backup role:
--   psql -U postgres -c "CREATE ROLE helpdesk_backup LOGIN PASSWORD 'a-long-password-with-letters-and-digits';"
--   psql -U postgres -d uoa_helpdesk -f server\sql\hardening_db.sql
-- It is safe to run again. Needs PostgreSQL 14 or newer (for pg_read_all_data).
BEGIN;

-- 1) Only the two named roles may connect to this database. Everyone else is refused.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO helpdesk_app, helpdesk_backup', current_database());
END $$;

-- 2) Nobody may create objects in the public schema (the app never needs to)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 3) The app role: a plain role with limits, so a runaway query or a stuck connection cannot hurt
ALTER ROLE helpdesk_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40;
ALTER ROLE helpdesk_app SET statement_timeout = '60s';
ALTER ROLE helpdesk_app SET lock_timeout = '15s';
ALTER ROLE helpdesk_app SET idle_in_transaction_session_timeout = '60s';

-- 4) Take away anything the app never needs
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM helpdesk_app;
REVOKE ALL ON audit_log FROM helpdesk_app;
GRANT SELECT, INSERT ON audit_log TO helpdesk_app;   -- the audit log: add and read, never change or delete

-- 5) The backup role: it can READ everything and change nothing
GRANT pg_read_all_data TO helpdesk_backup;
ALTER ROLE helpdesk_backup NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
ALTER ROLE helpdesk_backup SET default_transaction_read_only = on;

COMMIT;

-- ---- What you should see now ----
-- The two roles: rolsuper must be f (false) for both
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolconnlimit
  FROM pg_roles WHERE rolname IN ('helpdesk_app', 'helpdesk_backup') ORDER BY rolname;

-- What the app role may do with each table
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS app_privileges
  FROM information_schema.role_table_grants
 WHERE grantee = 'helpdesk_app' AND table_schema = 'public'
 GROUP BY table_name ORDER BY table_name;