// Shared ticket queries: the column list used by the list and the detail view,
// and buildDetail() which assembles one ticket with its comments, files and history.
import type { Db } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { HttpError } from "../lib/http";
import { overdueSql } from "../lib/sql";
import { canSeeInternal, ticketScope } from "../security/scope";

/**
 * Columns shown in the ticket list (and the top of the detail view).
 * file_count counts only files that EVERYONE who sees the ticket may see
 * (files on internal notes are left out, so a USER's paperclip number never leaks anything).
 */
export const SUMMARY_COLUMNS = `
  t.id, t.title, t.status, t.priority, t.source,
  t.business_unit_id, bu.code AS unit_code, bu.name AS unit_name,
  t.created_by, ru.name AS requester_name, t.requester_email,
  t.assigned_to, au.name AS assignee_name,
  t.due_at, t.created_at, t.updated_at, t.resolved_at, t.closed_at,
  ${overdueSql("t")} AS is_overdue,
  (SELECT count(*) FROM ticket_files f
     LEFT JOIN comments fc ON fc.id = f.comment_id
    WHERE f.ticket_id = t.id AND (fc.id IS NULL OR fc.is_internal = FALSE))::int AS file_count`;

/** The tables joined to "tickets t" to get unit, requester and assignee names. */
export const TICKET_JOINS = `
  JOIN business_units bu ON bu.id = t.business_unit_id
  JOIN users ru ON ru.id = t.created_by
  LEFT JOIN users au ON au.id = t.assigned_to`;

/**
 * One ticket + its conversation + its files + its history, as the given user is allowed to see it.
 *  - out of scope or missing  -> 404
 *  - USER never receives internal notes or files attached to them (filtered here, in SQL)
 *  - history (audit trail) is only returned to IT / ADMIN
 */
export async function buildDetail(db: Db, user: AuthUser, id: number) {
  const scope = ticketScope(user, 2, "t");
  const t = await db.query(
    `SELECT ${SUMMARY_COLUMNS}, t.description
       FROM tickets t ${TICKET_JOINS}
      WHERE t.id = $1 AND ${scope.sql}`,
    [id, ...scope.params],
  );
  if (!t.rows[0]) throw new HttpError(404, "Not found");

  const staff = canSeeInternal(user);

  const comments = await db.query(
    `SELECT c.id, c.body, c.is_internal, c.source, c.created_at,
            c.author_id, u.name AS author_name, u.role AS author_role
       FROM comments c
       JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = $1 ${staff ? "" : "AND c.is_internal = FALSE"}
      ORDER BY c.created_at, c.id`,
    [id],
  );

  // Every file of this ticket. comment_id = null means "attached to the ticket itself".
  const files = await db.query(
    `SELECT f.id, f.comment_id, f.original_name, f.mime, f.size_bytes, f.created_at,
            f.uploaded_by, u.name AS uploader_name
       FROM ticket_files f
       JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN comments c ON c.id = f.comment_id
      WHERE f.ticket_id = $1 ${staff ? "" : "AND (c.id IS NULL OR c.is_internal = FALSE)"}
      ORDER BY f.id`,
    [id],
  );

  let history: unknown[] | null = null;
  if (staff) {
    const h = await db.query(
      `SELECT a.id, a.action, a.details, a.created_at, a.actor_id, u.name AS actor_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.ticket_id = $1
        ORDER BY a.id DESC
        LIMIT 200`,
      [id],
    );
    history = h.rows;
  }

  return {
    ticket: t.rows[0],
    comments: comments.rows,
    files: files.rows,
    history,
  };
}
