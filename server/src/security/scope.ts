// WHO CAN SEE WHAT. This file is the single source of truth for visibility.
// Every ticket query, stat, export, comment, audit, assignee and attachment
// route must use ticketScope(). Never write your own visibility rule elsewhere.
import type { Db } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { HttpError } from "../lib/http";

export interface ScopeClause {
  /** A piece of SQL to add to a WHERE clause with AND. */
  sql: string;
  /** The values for the $n placeholders used by `sql`. */
  params: unknown[];
}

/**
 * Ticket visibility rule:
 *   ADMIN -> every ticket
 *   IT    -> tickets of their own business unit (an IT user with no unit sees nothing)
 *   USER  -> only tickets they created
 *
 * `nextParam` = the number of the next free $ placeholder in your query.
 * Example: SELECT ... FROM tickets t WHERE t.status = $1 AND <scope.sql>
 *          -> call ticketScope(user, 2) and add scope.params after your own params.
 */
export function ticketScope(
  user: AuthUser,
  nextParam: number,
  alias = "t",
): ScopeClause {
  switch (user.role) {
    case "ADMIN":
      return { sql: "TRUE", params: [] };
    case "IT":
      if (user.business_unit_id == null) return { sql: "FALSE", params: [] }; // no unit = sees nothing
      return {
        sql: `${alias}.business_unit_id = $${nextParam}`,
        params: [user.business_unit_id],
      };
    case "USER":
      return { sql: `${alias}.created_by = $${nextParam}`, params: [user.id] };
    default:
      return { sql: "FALSE", params: [] }; // unknown role: see nothing (safe default)
  }
}

/**
 * Fetch ONE ticket the user is allowed to see.
 * If it does not exist OR is out of scope, throw 404 (never 403),
 * so nobody can learn that a ticket in another unit exists.
 * forUpdate = true locks the row for the rest of the transaction (used for status changes).
 */
export async function getScopedTicket(
  db: Db,
  user: AuthUser,
  ticketId: number,
  forUpdate = false,
): Promise<any> {
  const s = ticketScope(user, 2, "t");
  const r = await db.query(
    `SELECT t.* FROM tickets t WHERE t.id = $1 AND ${s.sql} ${forUpdate ? "FOR UPDATE OF t" : ""}`,
    [ticketId, ...s.params],
  );
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

/** Internal notes and the history timeline are for IT/ADMIN only. */
export function canSeeInternal(user: AuthUser): boolean {
  return user.role === "ADMIN" || user.role === "IT";
}

/**
 * Same rule as ticketScope, but for a ticket row already in memory.
 * Used by the email worker to decide if a sender may reply into a ticket.
 */
export function canSeeTicketRow(
  user: Pick<AuthUser, "id" | "role" | "business_unit_id">,
  ticket: { created_by: number; business_unit_id: number },
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "IT")
    return (
      user.business_unit_id != null &&
      user.business_unit_id === ticket.business_unit_id
    );
  return ticket.created_by === user.id;
}

/**
 * Knowledge-base visibility (same idea as ticketScope):
 *   ADMIN -> every article
 *   IT    -> all articles of their own unit (any status) + published global articles
 *   USER  -> published articles that are global or in their own unit
 */
export function articleScope(
  user: AuthUser,
  nextParam: number,
  alias = "a",
): ScopeClause {
  switch (user.role) {
    case "ADMIN":
      return { sql: "TRUE", params: [] };
    case "IT":
      if (user.business_unit_id == null) {
        return {
          sql: `(${alias}.business_unit_id IS NULL AND ${alias}.status = 'PUBLISHED')`,
          params: [],
        };
      }
      return {
        sql: `(${alias}.business_unit_id = $${nextParam} OR (${alias}.business_unit_id IS NULL AND ${alias}.status = 'PUBLISHED'))`,
        params: [user.business_unit_id],
      };
    case "USER":
      if (user.business_unit_id == null) {
        return {
          sql: `(${alias}.business_unit_id IS NULL AND ${alias}.status = 'PUBLISHED')`,
          params: [],
        };
      }
      return {
        sql: `(${alias}.status = 'PUBLISHED' AND (${alias}.business_unit_id IS NULL OR ${alias}.business_unit_id = $${nextParam}))`,
        params: [user.business_unit_id],
      };
    default:
      return { sql: "FALSE", params: [] };
  }
}

/** Who may create or edit an article in a unit? (null unit = global, ADMIN only.) */
export function canWriteArticle(
  user: AuthUser,
  articleUnitId: number | null,
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "IT")
    return articleUnitId != null && articleUnitId === user.business_unit_id;
  return false;
}
