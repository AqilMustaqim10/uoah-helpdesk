-- Keep audit entries for at most 14 days. Run once as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_audit_retention.sql
BEGIN;

CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_user = pg_catalog.pg_get_userbyid(
       (SELECT relowner FROM pg_catalog.pg_class WHERE oid = TG_RELID)
     )
     AND OLD.created_at < pg_catalog.now() - INTERVAL '14 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_audit_log() RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < pg_catalog.now() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

DO $$
DECLARE
  audit_table_owner NAME;
BEGIN
  SELECT r.rolname INTO audit_table_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
  WHERE c.oid = 'public.audit_log'::regclass;

  EXECUTE format(
    'ALTER FUNCTION public.purge_old_audit_log() OWNER TO %I',
    audit_table_owner
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_audit_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_log() TO helpdesk_app;

COMMIT;
