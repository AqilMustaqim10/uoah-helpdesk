// CSV export. Mounted at /api/export for IT/ADMIN only (index.ts), and scoped like the list.
import { Router } from "express";
import { pool, query } from "../db/pool";
import { audit } from "../db/audit";
import { ah } from "../lib/http";
import { toCsv } from "../lib/csv";
import { ticketRef } from "../lib/sql";
import { buildTicketFilters } from "../services/ticketFilters";
import { SUMMARY_COLUMNS, TICKET_JOINS } from "../services/ticketQueries";

const router = Router();

const MAX_EXPORT_ROWS = 10000; // safety limit

// GET /api/export/tickets.csv?status=&priority=&unit=&assignee=&q=
router.get(
  "/tickets.csv",
  ah(async (req, res) => {
    const user = req.user!;
    const { conds, params } = buildTicketFilters(
      user,
      req.query as Record<string, unknown>,
    );

    const r = await query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM tickets t ${TICKET_JOINS}
        WHERE ${conds.join(" AND ")}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ${MAX_EXPORT_ROWS}`,
      params,
    );

    const headers = [
      "Ticket",
      "Title",
      "Status",
      "Priority",
      "Business unit",
      "Requester",
      "Requester email",
      "Assignee",
      "Source",
      "Created (UTC)",
      "Due date (UTC)",
      "Overdue",
      "Resolved (UTC)",
      "Closed (UTC)",
    ];
    const rows = r.rows.map((t) => [
      ticketRef(t.id),
      t.title,
      t.status,
      t.priority,
      t.unit_code,
      t.requester_name,
      t.requester_email,
      t.assignee_name ?? "",
      t.source,
      t.created_at,
      t.due_at,
      t.is_overdue ? "Yes" : "No",
      t.resolved_at,
      t.closed_at,
    ]);

    // Leave a trace of who exported how many rows
    await audit(pool, {
      actorId: user.id,
      action: "TICKETS_EXPORTED",
      entityType: "export",
      entityId: "tickets",
      details: { rows: rows.length },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(toCsv(headers, rows));
  }),
);

export default router;
