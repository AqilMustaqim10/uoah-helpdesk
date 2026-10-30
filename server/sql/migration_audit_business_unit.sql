-- Add business-unit attribution to existing audit events.
-- Run once as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_audit_business_unit.sql
BEGIN;

ALTER TABLE audit_log
  ADD COLUMN business_unit_id SMALLINT REFERENCES business_units(id);

-- Existing audit rows are immutable to the application. Temporarily replace the
-- row trigger within this transaction while deriving historical associations.
DROP TRIGGER audit_log_no_update_delete ON audit_log;

UPDATE audit_log a
SET business_unit_id = CASE
  WHEN a.ticket_id IS NOT NULL OR a.entity_type = 'ticket' THEN (
    SELECT t.business_unit_id
    FROM tickets t
    WHERE t.id = COALESCE(
      a.ticket_id,
      CASE WHEN a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END
    )
  )
  WHEN a.entity_type = 'article' THEN (
    SELECT ar.business_unit_id
    FROM articles ar
    WHERE ar.id = CASE WHEN a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END
  )
  WHEN a.entity_type = 'user' THEN (
    SELECT u.business_unit_id
    FROM users u
    WHERE u.id = CASE WHEN a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END
  )
  WHEN a.entity_type = 'unit' THEN (
    SELECT bu.id
    FROM business_units bu
    WHERE bu.id = CASE WHEN a.entity_id ~ '^[0-9]+$' THEN a.entity_id::smallint END
  )
  ELSE (
    SELECT u.business_unit_id
    FROM users u
    WHERE u.id = a.actor_id
  )
END;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

CREATE INDEX audit_business_unit_idx ON audit_log (business_unit_id);

COMMIT;
