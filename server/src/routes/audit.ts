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
// GET /api/audit?actor=&action=&entity=&ticket=&from=&to=&page=
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
        `SELECT count(*)::int AS n FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${where}`,
        params,
      )
    ).rows[0].n;

    const page = Math.min(
      100000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const rows = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ticket_id, a.details, a.created_at,
              a.actor_id, u.name AS actor_name, u.email AS actor_email
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         ${where}
        ORDER BY a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );

    res.json({ rows: rows.rows, total, page, pageSize: PAGE_SIZE });
  }),
);

export default router;
