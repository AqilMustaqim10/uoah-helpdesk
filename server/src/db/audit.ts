// Writes one row into the append-only audit_log table.
// The database itself blocks UPDATE/DELETE on that table (see schema.sql trigger).
import type { Db } from "./pool";

export interface AuditEntry {
  actorId: number | null; // who did it (null = system / email worker)
  action: string; // what happened, e.g. TICKET_STATUS_CHANGED
  entityType: string; // ticket | comment | user | unit | article | file
  entityId: string | number; // id of the thing that changed
  ticketId?: number | null; // set when it relates to a ticket (used for the history timeline)
  details?: Record<string, unknown>; // extra facts, e.g. { from: 'OPEN', to: 'IN_PROGRESS' }
}

/**
 * IMPORTANT: always pass the transaction client (the `c` from withTx), not the pool.
 * That way the audit row is saved or rolled back together with the action itself.
 */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_id, ticket_id, entity_type, entity_id, action, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      e.actorId,
      e.ticketId ?? null,
      e.entityType,
      String(e.entityId),
      e.action,
      JSON.stringify(e.details ?? {}),
    ],
  );
}
