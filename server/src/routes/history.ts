// Ticket History: every RESOLVED and CLOSED ticket of every business unit, READ-ONLY.
// Mounted at /api/history for ADMIN and IT only (index.ts). Everyone else gets "not found".
//
// This is a deliberate, narrow exception to ticketScope(): IT may READ finished tickets of other units
// (so every unit can learn from the history), but this router can never change anything: every method
// except GET and HEAD answers 403. Changes go through the normal ticket routes, which keep their own rules
// (IT: own unit only and never closed tickets; ADMIN: everything).
//
// What is returned: the ticket, its PUBLIC replies, and the files on the ticket or on public replies.
// Internal notes, files on internal notes, and the audit history are NEVER returned here.
import { Router } from "express";
import { pool, query } from "../db/pool";
import { audit } from "../db/audit";
import { PAGINATION, PRIORITIES } from "../config/constants";
import { ah, HttpError } from "../lib/http";
import { escapeLike } from "../lib/sql";
import { bodyId, idParam, oneOf } from "../lib/validate";
import { sendStoredFile } from "../services/sendFile";

const router = Router();

const HISTORY_STATUSES = ["RESOLVED", "CLOSED"] as const;
type HistoryStatus = (typeof HISTORY_STATUSES)[number];

/** The moment a ticket became finished (closed, otherwise resolved). */
const FINISHED_AT = "COALESCE(t.closed_at, t.resolved_at, t.updated_at)";

// The history can only be READ. Any other method is refused outright, for ADMIN and IT alike.
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  res.status(403).json({ error: "The ticket history is read-only." });
});

/** The columns of a history row. file_count counts only files that are not on internal notes. */
const COLUMNS = `
  t.id, t.title, t.status, t.priority, t.source,
  t.business_unit_id, bu.code AS unit_code, bu.name AS unit_name,
  ru.name AS requester_name, ru.department AS requester_department,
  au.name AS assignee_name,
  t.created_at, t.resolved_at, t.closed_at,
  ${FINISHED_AT} AS finished_at,
  (SELECT count(*)::int FROM ticket_files f
     LEFT JOIN comments fc ON fc.id = f.comment_id
    WHERE f.ticket_id = t.id AND (fc.id IS NULL OR fc.is_internal = FALSE)) AS file_count`;

const JOINS = `
  JOIN business_units bu ON bu.id = t.business_unit_id
  JOIN users ru ON ru.id = t.created_by
  LEFT JOIN users au ON au.id = t.assigned_to`;

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
// GET /api/history?q=&status=&priority=&unit=&from=&to=&page=
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    // Only finished tickets are ever listed. (No ticketScope here: this is the cross-unit history.)
    const conds: string[] = [`t.status IN ('RESOLVED','CLOSED')`];
    const params: unknown[] = [];

    const priority = qstr(req.query.priority);
    if (priority) {
      params.push(oneOf(priority, PRIORITIES, "priority"));
      conds.push(`t.priority = $${params.length}`);
    }

    const unit = qstr(req.query.unit);
    if (unit) {
      params.push(bodyId(unit, "unit"));
      conds.push(`t.business_unit_id = $${params.length}`);
    }

    // The date range applies to the day the ticket was finished
    const from = dateParam(req.query.from, "start");
    if (from) {
      params.push(from);
      conds.push(`${FINISHED_AT} >= $${params.length}`);
    }
    const to = dateParam(req.query.to, "end");
    if (to) {
      params.push(to);
      conds.push(`${FINISHED_AT} <= $${params.length}`);
    }

    // Search: ticket number (HD-12 or 12), title, description, requester email
    const q = qstr(req.query.q).slice(0, 100);
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      const n = params.length;
      let c = `(t.title ILIKE $${n} OR t.description ILIKE $${n} OR t.requester_email ILIKE $${n}`;
      const m = /^(?:hd-?)?(\d{1,15})$/i.exec(q);
      if (m) {
        params.push(Number(m[1]));
        c += ` OR t.id = $${params.length}`;
      }
      conds.push(c + ")");
    }

    // Counts per status for the chips (they ignore the status filter itself)
    const countRows = await query(
      `SELECT t.status, count(*)::int AS n FROM tickets t WHERE ${conds.join(" AND ")} GROUP BY t.status`,
      params,
    );
    const counts: Record<HistoryStatus, number> = { RESOLVED: 0, CLOSED: 0 };
    for (const row of countRows.rows)
      counts[row.status as HistoryStatus] = row.n;

    // The status filter, then the page of results
    const status = qstr(req.query.status);
    const listConds = [...conds];
    const listParams = [...params];
    if (status) {
      listParams.push(oneOf(status, HISTORY_STATUSES, "status"));
      listConds.push(`t.status = $${listParams.length}`);
    }
    const total = status
      ? counts[status as HistoryStatus]
      : counts.RESOLVED + counts.CLOSED;

    const page = Math.min(
      10000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const pageSize = PAGINATION.defaultPageSize;
    listParams.push(pageSize, (page - 1) * pageSize);

    const rows = await query(
      `SELECT ${COLUMNS}
         FROM tickets t ${JOINS}
        WHERE ${listConds.join(" AND ")}
        ORDER BY ${FINISHED_AT} DESC, t.id DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    res.json({ tickets: rows.rows, total, page, pageSize, counts });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/history/files/:fileId   a file of a finished ticket (never a file on an internal note)
// (Defined before /:id; the two paths cannot be confused because this one has two segments.)
// ---------------------------------------------------------------------------
router.get(
  "/files/:fileId",
  ah(async (req, res) => {
    const fileId = idParam(req.params.fileId);
    const r = await query(
      `SELECT f.original_name, f.stored_name, f.mime
         FROM ticket_files f
         JOIN tickets t ON t.id = f.ticket_id
         LEFT JOIN comments c ON c.id = f.comment_id
        WHERE f.id = $1
          AND t.status IN ('RESOLVED','CLOSED')
          AND (c.id IS NULL OR c.is_internal = FALSE)`,
      [fileId],
    );
    const f = r.rows[0];
    if (!f) throw new HttpError(404, "Not found");

    // The type comes from the DATABASE (detected from the file's bytes when it was uploaded)
    await sendStoredFile(res, {
      storedName: f.stored_name,
      mime: f.mime,
      originalName: f.original_name,
      download: req.query.download === "1",
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/history/:id   one finished ticket, read-only
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    const t = await query(
      `SELECT ${COLUMNS}, t.description, t.requester_email
         FROM tickets t ${JOINS}
        WHERE t.id = $1 AND t.status IN ('RESOLVED','CLOSED')`,
      [id],
    );
    const ticket = t.rows[0];
    if (!ticket) throw new HttpError(404, "Not found"); // missing, deleted, or reopened: it is not in the history

    // PUBLIC replies only (internal notes never leave the ticket's own unit)
    const comments = await query(
      `SELECT c.id, c.body, c.source, c.created_at, c.author_id, u.name AS author_name, u.role AS author_role
         FROM comments c
         JOIN users u ON u.id = c.author_id
        WHERE c.ticket_id = $1 AND c.is_internal = FALSE
        ORDER BY c.created_at, c.id`,
      [id],
    );

    // Files on the ticket or on public replies only
    const files = await query(
      `SELECT f.id, f.comment_id, f.original_name, f.mime, f.size_bytes, f.created_at, u.name AS uploader_name
         FROM ticket_files f
         JOIN users u ON u.id = f.uploaded_by
         LEFT JOIN comments c ON c.id = f.comment_id
        WHERE f.ticket_id = $1 AND (c.id IS NULL OR c.is_internal = FALSE)
        ORDER BY f.id`,
      [id],
    );

    // An IT person opening a ticket of ANOTHER unit leaves a trace in the audit log
    if (
      user.role === "IT" &&
      ticket.business_unit_id !== user.business_unit_id
    ) {
      await audit(pool, {
        actorId: user.id,
        action: "TICKET_HISTORY_VIEWED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: { ref: `HD-${id}`, unit: ticket.unit_code },
      });
    }

    res.json({
      ticket,
      comments: comments.rows,
      files: files.rows,
      // Only a hint for the screen: the real checks are on the routes that change things
      canManage: user.role === "ADMIN",
    });
  }),
);

export default router;
