// The audit log viewer (ADMIN only: index.ts mounts this behind requireRole('ADMIN')).
// Read-only. The audit_log table itself can never be changed (database trigger).
import { Router } from "express";
import { query } from "../db/pool";
import { ah, HttpError } from "../lib/http";
import { escapeLike } from "../lib/sql";

const router = Router();
const PAGE_SIZE = 50;

/** A query-string value as clean text ('' when missing or not a string). */
function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A date from the query string (ISO text). Empty means "no limit". */
function dateParam(v: unknown, label: string): Date | null {
  const s = qstr(v);
  if (!s) return null;
  const d = s.length <= 40 ? new Date(s) : new Date(NaN);
  if (Number.isNaN(d.getTime()))
    throw new HttpError(400, `Invalid ${label} date.`);
  return d;
}

function ticketIdParam(v: unknown): number {
  const value = qstr(v);
  if (!/^\d{1,15}$/.test(value) || Number(value) < 1)
    throw new HttpError(400, "Invalid ticket number.");
  return Number(value);
}

// ---------------------------------------------------------------------------
// GET /api/audit/actions   every kind of action that exists (fills the filter dropdown)
// ---------------------------------------------------------------------------
router.get(
  "/actions",
  ah(async (_req, res) => {
    const r = await query(
      "SELECT DISTINCT action FROM audit_log ORDER BY action",
    );
    res.json({ actions: r.rows.map((x) => x.action as string) });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/audit/:ticketId/details  complete timeline for one ticket
// ---------------------------------------------------------------------------
router.get(
  "/:ticketId/details",
  ah(async (req, res) => {
    const ticketId = ticketIdParam(req.params.ticketId);
    const ticket = await query(
      `SELECT history.ticket_id,
              COALESCE(t.title, deleted.title, 'Deleted ticket') AS title,
              bu.code AS business_unit_code, bu.name AS business_unit_name
         FROM (SELECT DISTINCT ticket_id
                 FROM audit_log
                WHERE ticket_id = $1) history
         LEFT JOIN tickets t ON t.id = history.ticket_id
         LEFT JOIN LATERAL (
           SELECT details->>'title' AS title
             FROM audit_log
            WHERE ticket_id = history.ticket_id
              AND action = 'TICKET_DELETED'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
         ) deleted ON TRUE
         LEFT JOIN business_units bu ON bu.id = COALESCE(
           t.business_unit_id,
           (SELECT business_unit_id
              FROM audit_log
             WHERE ticket_id = history.ticket_id
               AND business_unit_id IS NOT NULL
             ORDER BY created_at DESC, id DESC
             LIMIT 1)
         )`,
      [ticketId],
    );
    if (ticket.rows.length === 0)
      throw new HttpError(404, "Ticket history not found.");

    const rows = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ticket_id, a.details, a.created_at,
              a.actor_id, u.name AS actor_name, u.email AS actor_email,
              bu.code AS business_unit_code, bu.name AS business_unit_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN business_units bu ON bu.id = a.business_unit_id
        WHERE a.ticket_id = $1
        ORDER BY a.created_at DESC, a.id DESC`,
      [ticketId],
    );

    res.json({ ticket: ticket.rows[0], rows: rows.rows });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/audit?actor=&action=&entity=&ticket=&bu=&from=&to=&page=
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const conds: string[] = [];
    const params: unknown[] = [];

    // Who did it (name or email)
    const actor = qstr(req.query.actor).slice(0, 100);
    if (actor) {
      params.push(`%${escapeLike(actor)}%`);
      conds.push(
        `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }

    // What happened. Strict shape check, then passed as a parameter.
    const action = qstr(req.query.action);
    if (action) {
      if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(action))
        throw new HttpError(400, "Invalid action filter.");
      params.push(action);
      conds.push(`a.action = $${params.length}`);
    }

    // What kind of thing it happened to
    const entity = qstr(req.query.entity);
    if (entity) {
      if (!/^[a-z_]{2,30}$/.test(entity))
        throw new HttpError(400, "Invalid type filter.");
      params.push(entity);
      conds.push(`a.entity_type = $${params.length}`);
    }

    // Business unit code (bu is preferred; business_unit is accepted as an alias).
    const buParam = qstr(req.query.bu) || qstr(req.query.business_unit);
    if (buParam) {
      const businessUnit = buParam.toUpperCase();
      if (!/^(CCEC|FNB|HOTEL|KLBS|KLW|HQ)$/.test(businessUnit))
        throw new HttpError(400, "Invalid business unit filter.");
      params.push(businessUnit);
      conds.push(`bu.code = $${params.length}`);
    }

    // A ticket number: HD-12 or 12
    const ticket = qstr(req.query.ticket);
    if (ticket) {
      const m = /^(?:hd-?)?(\d{1,15})$/i.exec(ticket);
      if (!m) throw new HttpError(400, "Invalid ticket number.");
      params.push(Number(m[1]));
      conds.push(`a.ticket_id = $${params.length}`);
    }

    // Date range (the browser sends the start and the end of the chosen days)
    const from = dateParam(req.query.from, "start");
    if (from) {
      params.push(from);
      conds.push(`a.created_at >= $${params.length}`);
    }
    const to = dateParam(req.query.to, "end");
    if (to) {
      params.push(to);
      conds.push(`a.created_at <= $${params.length}`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const total: number = (
      await query(
        `WITH matching_tickets AS (
           SELECT DISTINCT a.ticket_id
           FROM audit_log a
          LEFT JOIN tickets t ON t.id = a.ticket_id
           LEFT JOIN users u ON u.id = a.actor_id
          LEFT JOIN business_units bu
            ON bu.id = COALESCE(t.business_unit_id, a.business_unit_id)
          ${where ? `${where} AND` : "WHERE"} a.ticket_id IS NOT NULL
        )
         SELECT count(*)::int AS n FROM matching_tickets`,
        params,
      )
    ).rows[0].n;

    const page = Math.min(
      100000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const rows = await query(
      `WITH matching_tickets AS (
         SELECT DISTINCT a.ticket_id
         FROM audit_log a
         LEFT JOIN tickets t ON t.id = a.ticket_id
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN business_units bu
           ON bu.id = COALESCE(t.business_unit_id, a.business_unit_id)
         ${where ? `${where} AND` : "WHERE"} a.ticket_id IS NOT NULL
       )
       SELECT mt.ticket_id,
              COALESCE(t.title, deleted.title, 'Deleted ticket') AS title,
              MAX(a.created_at) AS latest_modified_at,
              count(*)::int AS total_change_count,
              bu.code AS business_unit_code, bu.name AS business_unit_name
         FROM matching_tickets mt
         LEFT JOIN tickets t ON t.id = mt.ticket_id
         JOIN audit_log a ON a.ticket_id = mt.ticket_id
         LEFT JOIN LATERAL (
           SELECT details->>'title' AS title
             FROM audit_log
            WHERE ticket_id = mt.ticket_id
              AND action = 'TICKET_DELETED'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
         ) deleted ON TRUE
         LEFT JOIN business_units bu ON bu.id = COALESCE(
           t.business_unit_id,
           (SELECT business_unit_id
              FROM audit_log
             WHERE ticket_id = mt.ticket_id
               AND business_unit_id IS NOT NULL
             ORDER BY created_at DESC, id DESC
             LIMIT 1)
         )
        GROUP BY mt.ticket_id, t.id, t.title, deleted.title, bu.code, bu.name
        ORDER BY MAX(a.created_at) DESC, t.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );

    res.json({ rows: rows.rows, total, page, pageSize: PAGE_SIZE });
  }),
);

export default router;
