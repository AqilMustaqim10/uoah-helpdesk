// Ticket list, create, view, and the changes only IT/ADMIN may make
// (status, priority, assignee, due date). Mounted at /api/tickets (login required).
// New in step E: emails are sent AFTER each change is committed (never blocking the action).
import { Router } from "express";
import { pool, query, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { bodyId, cleanText, idParam, oneOf } from "../lib/validate";
import { escapeLike } from "../lib/sql";
import {
  DEFAULT_PRIORITY,
  PAGINATION,
  PRIORITIES,
  STATUSES,
  TRANSITIONS,
  type Status,
} from "../config/constants";
import type { AuthUser } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import {
  canSeeInternal,
  getScopedTicket,
  ticketScope,
} from "../security/scope";
import {
  notifyAssigned,
  notifyStatusChanged,
  notifyTicketCreated,
} from "../services/notify";
import {
  SUMMARY_COLUMNS,
  TICKET_JOINS,
  buildDetail,
} from "../services/ticketQueries";
import { addTicketActivityFilters } from "../services/ticketFilters";

const router = Router();

/** A query-string value as clean text ('' when missing or not a string). */
function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Only IT and ADMIN may continue. (Call AFTER the scope check so out-of-scope stays 404.) */
function requireStaff(user: AuthUser): void {
  if (!canSeeInternal(user))
    throw new HttpError(403, "Only IT staff can do that.");
}

/** Closed tickets are read-only. */
function ensureNotClosed(ticket: { status: string }): void {
  if (ticket.status === "CLOSED")
    throw new HttpError(409, "This ticket is closed and cannot be changed.");
}

const toIso = (d: Date | string | null): string | null =>
  d ? new Date(d).toISOString() : null;

// ---------------------------------------------------------------------------
// GET /api/tickets?q=&status=&priority=&unit=&assignee=&active=&overdue=&created_within=&page=&page_size=
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;
    const conds: string[] = [];
    const params: unknown[] = [];

    // 1) Visibility: ALWAYS first, always from ticketScope
    const scope = ticketScope(user, 1);
    conds.push(scope.sql);
    params.push(...scope.params);

    // 2) Optional filters (every value is whitelisted or passed as a parameter)
    const priority = qstr(req.query.priority);
    if (priority) {
      params.push(oneOf(priority, PRIORITIES, "priority"));
      conds.push(`t.priority = $${params.length}`);
    }

    addTicketActivityFilters(req.query, conds, params);

    // Unit filter only means something for ADMIN (IT and USER are already limited by scope)
    const unit = qstr(req.query.unit);
    if (unit && user.role === "ADMIN") {
      params.push(bodyId(unit, "unit"));
      conds.push(`t.business_unit_id = $${params.length}`);
    }

    const assignee = qstr(req.query.assignee);
    if (assignee === "unassigned") {
      conds.push("t.assigned_to IS NULL");
    } else if (assignee === "me") {
      params.push(user.id);
      conds.push(`t.assigned_to = $${params.length}`);
    } else if (assignee) {
      throw new HttpError(400, "Invalid assignee filter.");
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

    // 3) Counts per status (for the chips). They ignore the status filter itself.
    const baseConds = [...conds];
    const baseParams = [...params];
    const countRows = await query(
      `SELECT t.status, count(*)::int AS n FROM tickets t WHERE ${baseConds.join(" AND ")} GROUP BY t.status`,
      baseParams,
    );
    const counts: Record<Status, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };
    for (const row of countRows.rows) counts[row.status as Status] = row.n;

    // 4) Status filter, then the page of results
    const status = qstr(req.query.status);
    const listConds = [...baseConds];
    const listParams = [...baseParams];
    if (status) {
      listParams.push(oneOf(status, STATUSES, "status"));
      listConds.push(`t.status = $${listParams.length}`);
    }
    const total = status
      ? counts[status as Status]
      : counts.OPEN + counts.IN_PROGRESS + counts.RESOLVED + counts.CLOSED;

    const page = Math.min(
      10000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const pageSize = Math.min(
      PAGINATION.maxPageSize,
      Math.max(
        1,
        parseInt(qstr(req.query.page_size), 10) || PAGINATION.defaultPageSize,
      ),
    );
    listParams.push(pageSize, (page - 1) * pageSize);

    const rows = await query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM tickets t ${TICKET_JOINS}
        WHERE ${listConds.join(" AND ")}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    res.json({ tickets: rows.rows, total, page, pageSize, counts });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tickets   { title, description, priority?, business_unit_id? }
// ---------------------------------------------------------------------------
router.post(
  "/",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const title = cleanText(req.body?.title, "Title", { min: 3, max: 200 });
    const description = cleanText(req.body?.description, "Description", {
      min: 3,
      max: 20000,
      multiline: true,
    });

    // Only IT/ADMIN may choose a priority. A USER's ticket is always MEDIUM,
    // whatever the request says.
    const staff = canSeeInternal(user);
    const wantsPriority =
      req.body?.priority !== undefined && req.body?.priority !== "";
    const priority =
      staff && wantsPriority
        ? oneOf(req.body.priority, PRIORITIES, "priority")
        : DEFAULT_PRIORITY;

    // The ticket goes to the creator's own unit. Only ADMIN may pick another unit.
    let unitId = user.business_unit_id;
    if (user.role === "ADMIN" && req.body?.business_unit_id) {
      unitId = bodyId(req.body.business_unit_id, "business unit");
      const exists = await query("SELECT 1 FROM business_units WHERE id = $1", [
        unitId,
      ]);
      if (!exists.rows[0])
        throw new HttpError(400, "Please choose a valid business unit.");
    }
    if (unitId == null) {
      throw new HttpError(
        400,
        "Your account has no business unit. Please ask an administrator to set one.",
      );
    }

    const id = await withTx(async (c) => {
      const ins = await c.query(
        `INSERT INTO tickets (title, description, priority, business_unit_id, created_by, requester_email, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'WEB') RETURNING id`,
        [title, description, priority, unitId, user.id, user.email],
      );
      const ticketId: number = ins.rows[0].id;
      await audit(c, {
        actorId: user.id,
        action: "TICKET_CREATED",
        entityType: "ticket",
        entityId: ticketId,
        ticketId,
        details: { priority, business_unit_id: unitId },
      });
      return ticketId;
    });

    // Acknowledgment email (with [HD-n] in the subject): sent in the background, AFTER the commit
    notifyTicketCreated(id);

    res.status(201).json(await buildDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/tickets/:id
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  ah(async (req, res) => {
    res.json(await buildDetail(pool, req.user!, idParam(req.params.id)));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/tickets/:id/assignees   People this ticket may be assigned to (IT/ADMIN)
// = active IT of the ticket's unit + every active ADMIN
// ---------------------------------------------------------------------------
router.get(
  "/:id/assignees",
  ah(async (req, res) => {
    const user = req.user!;
    const ticket = await getScopedTicket(pool, user, idParam(req.params.id)); // 404 if out of scope
    requireStaff(user);
    const r = await query(
      `SELECT id, name, role FROM users
        WHERE is_active = TRUE AND (role = 'ADMIN' OR (role = 'IT' AND business_unit_id = $1))
        ORDER BY (role = 'IT') DESC, name`,
      [ticket.business_unit_id],
    );
    res.json({ assignees: r.rows });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/status   { status }
// ---------------------------------------------------------------------------
router.patch(
  "/:id/status",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const to = oneOf(req.body?.status, STATUSES, "status");

    const previous = await withTx(async (c) => {
      const t = await getScopedTicket(c, user, id, true); // locks the row; 404 if out of scope
      requireStaff(user);

      const from = t.status as Status;
      if (!TRANSITIONS[from].includes(to)) {
        throw new HttpError(409, `A ticket cannot move from ${from} to ${to}.`);
      }

      await c.query(
        `UPDATE tickets
            SET status = $2::text,
                updated_at = now(),
                resolved_at = CASE WHEN $2::text = 'RESOLVED' THEN now()
                                   WHEN $2::text IN ('OPEN','IN_PROGRESS') THEN NULL
                                   ELSE resolved_at END,
                closed_at = CASE WHEN $2::text = 'CLOSED' THEN now() ELSE closed_at END
          WHERE id = $1`,
        [id, to],
      );
      await audit(c, {
        actorId: user.id,
        action: "TICKET_STATUS_CHANGED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: { from, to },
      });
      return from;
    });

    // Email the requester (unless they made the change themselves): after commit, never blocking
    notifyStatusChanged(id, user.id, previous, to);

    res.json(await buildDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/priority   { priority }
// ---------------------------------------------------------------------------
router.patch(
  "/:id/priority",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const priority = oneOf(req.body?.priority, PRIORITIES, "priority");

    await withTx(async (c) => {
      const t = await getScopedTicket(c, user, id, true);
      requireStaff(user);
      ensureNotClosed(t);
      if (t.priority === priority) return; // nothing to change

      await c.query(
        "UPDATE tickets SET priority = $2, updated_at = now() WHERE id = $1",
        [id, priority],
      );
      await audit(c, {
        actorId: user.id,
        action: "TICKET_PRIORITY_CHANGED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: { from: t.priority, to: priority },
      });
    });

    res.json(await buildDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/assignee   { assignee_id: number | null }
// ---------------------------------------------------------------------------
router.patch(
  "/:id/assignee",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    const raw = req.body?.assignee_id;
    if (raw === undefined)
      throw new HttpError(
        400,
        "assignee_id is required (use null to unassign).",
      );
    const newId = raw === null ? null : bodyId(raw, "assignee");

    const changed = await withTx(async (c) => {
      const t = await getScopedTicket(c, user, id, true);
      requireStaff(user);
      ensureNotClosed(t);
      if ((t.assigned_to ?? null) === newId) return false; // nothing to change

      // Re-check on the server: active IT of THIS ticket's unit, or any active ADMIN.
      let newName: string | null = null;
      if (newId !== null) {
        const a = await c.query(
          `SELECT id, name FROM users
            WHERE id = $1 AND is_active = TRUE
              AND (role = 'ADMIN' OR (role = 'IT' AND business_unit_id = $2))`,
          [newId, t.business_unit_id],
        );
        if (!a.rows[0])
          throw new HttpError(
            400,
            "That person cannot be assigned to this ticket.",
          );
        newName = a.rows[0].name;
      }

      let oldName: string | null = null;
      if (t.assigned_to) {
        const o = await c.query("SELECT name FROM users WHERE id = $1", [
          t.assigned_to,
        ]);
        oldName = o.rows[0]?.name ?? null;
      }

      await c.query(
        "UPDATE tickets SET assigned_to = $2, updated_at = now() WHERE id = $1",
        [id, newId],
      );
      await audit(c, {
        actorId: user.id,
        action: "TICKET_ASSIGNED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: {
          from_id: t.assigned_to ?? null,
          from_name: oldName,
          to_id: newId,
          to_name: newName,
        },
      });
      return true;
    });

    // Email the new assignee (unless they assigned it to themselves): after commit, never blocking
    if (changed && newId !== null) notifyAssigned(id, user.id, newId);

    res.json(await buildDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id/due   { due_at: ISO date string | null }
// ---------------------------------------------------------------------------
router.patch(
  "/:id/due",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    const raw = req.body?.due_at;
    if (raw === undefined)
      throw new HttpError(400, "due_at is required (use null to clear it).");

    let due: Date | null = null;
    if (raw !== null) {
      if (typeof raw !== "string" || raw.length > 40)
        throw new HttpError(400, "Invalid due date.");
      due = new Date(raw);
      if (Number.isNaN(due.getTime()))
        throw new HttpError(400, "Invalid due date.");
      if (due.getTime() <= Date.now())
        throw new HttpError(400, "The due date must be in the future.");
      if (due.getTime() > Date.now() + 5 * 365 * 24 * 3600 * 1000) {
        throw new HttpError(400, "The due date is too far away.");
      }
    }

    await withTx(async (c) => {
      const t = await getScopedTicket(c, user, id, true);
      requireStaff(user);
      ensureNotClosed(t);

      await c.query(
        "UPDATE tickets SET due_at = $2, updated_at = now() WHERE id = $1",
        [id, due],
      );
      await audit(c, {
        actorId: user.id,
        action: "TICKET_DUE_CHANGED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: { from: toIso(t.due_at), to: toIso(due) },
      });
    });

    res.json(await buildDetail(pool, user, id));
  }),
);

export default router;
