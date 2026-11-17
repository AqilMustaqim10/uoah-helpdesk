// Requester confirmation is the final step of a resolved ticket.  Keep the
// wording deliberately strict: an ordinary follow-up must never close a ticket.
import { audit } from "../db/audit";
import type { Db } from "../db/pool";

/** True only for a short, unambiguous confirmation from the requester. */
export function isResolutionConfirmation(text: string): boolean {
  const message = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]/g, "")
    .replace(/\s+/g, " ");

  return [
    "resolved",
    "mark as resolved",
    "mark this as resolved",
    "mark ticket as resolved",
    "mark this ticket as resolved",
    "confirm resolved",
    "confirmed resolved",
    "issue resolved",
    "problem resolved",
  ].includes(message);
}

/** Close a resolved ticket after its requester has explicitly confirmed it. */
export async function closeAfterRequesterConfirmation(
  db: Db,
  ticketId: number,
  actorId: number,
  confirmation: "button" | "reply",
): Promise<boolean> {
  const changed = await db.query(
    `UPDATE tickets
        SET status = 'CLOSED', updated_at = now(), closed_at = now()
      WHERE id = $1 AND status = 'RESOLVED'
      RETURNING id`,
    [ticketId],
  );
  if (!changed.rows[0]) return false;

  await audit(db, {
    actorId,
    action: "TICKET_STATUS_CHANGED",
    entityType: "ticket",
    entityId: ticketId,
    ticketId,
    details: {
      from: "RESOLVED",
      to: "CLOSED",
      reason: "requester_confirmation",
      confirmation,
    },
  });
  return true;
}
