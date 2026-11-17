// Requester confirmation is the final step of a resolved ticket.  Keep the
// wording deliberately strict: an ordinary follow-up must never close a ticket.
import { audit } from "../db/audit";
import type { Db } from "../db/pool";

/** True only for a short, unambiguous confirmation from the requester. */
export function isResolutionConfirmation(text: string): boolean {
  // Email replies often have a greeting or signature around the confirmation.
  // Only inspect the first few non-empty lines: quoted earlier messages must
  // never cause an old confirmation phrase to close a ticket.
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .toLowerCase()
        .replace(/[.!?,:;]+$/g, "")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .slice(0, 3);

  return lines.some((line) =>
    /^(?:please\s+)?(?:mark\s+(?:(?:this|the)\s+)?(?:ticket\s+)?as\s+resolved|(?:this|the)\s+(?:ticket|issue|problem)\s+(?:is|has been)\s+resolved|(?:issue|problem)\s+resolved|(?:yes\s+)?(?:confirm(?:ed)?\s+)?resolved)(?:\s+(?:now|thanks?|thank you))?$/.test(
      line,
    ),
  );
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
