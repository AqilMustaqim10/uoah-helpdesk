// Saves the database rows for uploaded files (inside the caller's transaction)
// and writes the audit rows. Always pass the transaction client as `db`.
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { FILE_LIMITS } from "../config/constants";
import { HttpError } from "../lib/http";
import type { StoredFile } from "./upload";

/** A ticket may have at most 10 files attached directly to it (comments have their own 10). */
export async function ensureRoomForTicketFiles(
  db: Db,
  ticketId: number,
  adding: number,
): Promise<void> {
  const r = await db.query(
    "SELECT count(*)::int AS n FROM ticket_files WHERE ticket_id = $1 AND comment_id IS NULL",
    [ticketId],
  );
  if (r.rows[0].n + adding > FILE_LIMITS.maxFilesPerItem) {
    throw new HttpError(
      400,
      `A ticket can have at most ${FILE_LIMITS.maxFilesPerItem} attachments.`,
    );
  }
}

/** Inserts one ticket_files row (and one audit row) per file. commentId = null means "on the ticket itself". */
export async function insertTicketFiles(
  db: Db,
  o: {
    actorId: number;
    ticketId: number;
    commentId: number | null;
    files: StoredFile[];
  },
): Promise<void> {
  for (const f of o.files) {
    const r = await db.query(
      `INSERT INTO ticket_files (ticket_id, comment_id, uploaded_by, original_name, stored_name, mime, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        o.ticketId,
        o.commentId,
        o.actorId,
        f.originalName,
        f.storedName,
        f.kind.mime,
        f.size,
      ],
    );
    await audit(db, {
      actorId: o.actorId,
      action: "FILE_ADDED",
      entityType: "file",
      entityId: r.rows[0].id,
      ticketId: o.ticketId,
      details: {
        name: f.originalName,
        mime: f.kind.mime,
        size: f.size,
        comment_id: o.commentId,
      },
    });
  }
}
