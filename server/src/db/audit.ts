// Writes one row into the append-only audit_log table.
// The database itself blocks UPDATE/DELETE on that table (see schema.sql trigger).
import type { Db } from "./pool";

export interface AuditEntry {
  actorId: number | null; // who did it (null = system / email worker)
  action: string; // what happened, e.g. TICKET_STATUS_CHANGED
  entityType: string; // ticket | comment | user | unit | article | file
  entityId: string | number; // id of the thing that changed
  ticketId?: number | null; // set when it relates to a ticket (used for the history timeline)
  businessUnitId?: number | null; // explicit override; otherwise derived from the event's subject
  details?: Record<string, unknown>; // extra facts, e.g. { from: 'OPEN', to: 'IN_PROGRESS' }
}

/**
 * IMPORTANT: always pass the transaction client (the `c` from withTx), not the pool.
 * That way the audit row is saved or rolled back together with the action itself.
 */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (actor_id, ticket_id, business_unit_id, entity_type, entity_id, action, details)
     VALUES (
       $1::bigint, $2::bigint,
       CASE
         WHEN $7::smallint IS NOT NULL THEN $7::smallint
         WHEN $3::text = 'ticket' OR $2::bigint IS NOT NULL THEN (
           SELECT t.business_unit_id
           FROM tickets t
           WHERE t.id = COALESCE(
             $2::bigint,
             CASE WHEN $4::text ~ '^[0-9]+$' THEN $4::bigint END
           )
         )
         WHEN $3::text = 'article' THEN (
           SELECT a.business_unit_id
           FROM articles a
           WHERE a.id = CASE WHEN $4::text ~ '^[0-9]+$' THEN $4::bigint END
         )
         WHEN $3::text = 'user' THEN (
           SELECT u.business_unit_id
           FROM users u
           WHERE u.id = CASE WHEN $4::text ~ '^[0-9]+$' THEN $4::bigint END
         )
         WHEN $3::text = 'unit' THEN (
           SELECT bu.id
           FROM business_units bu
           WHERE bu.id = CASE WHEN $4::text ~ '^[0-9]+$' THEN $4::smallint END
         )
         ELSE (
           SELECT u.business_unit_id
           FROM users u
           WHERE u.id = $1::bigint
         )
       END,
       $3::text, $4::text, $5::text, $6::jsonb
     )`,
    [
      e.actorId,
      e.ticketId ?? null,
      e.entityType,
      String(e.entityId),
      e.action,
      JSON.stringify(e.details ?? {}),
      e.businessUnitId ?? null,
    ],
  );
}
