// PDF export of tickets. Mounted at /api/export for IT/ADMIN only (index.ts), and scoped exactly like the list:
// buildTicketFilters() puts ticketScope() first, so an IT user only ever exports their own unit's tickets.
// This REPLACES the old CSV export.
import { Router } from "express";
import { pool, query } from "../db/pool";
import { audit } from "../db/audit";
import { ah } from "../lib/http";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  buildTicketReportPdf,
} from "../services/pdfReport";
import { buildTicketFilters } from "../services/ticketFilters";
import { SUMMARY_COLUMNS, TICKET_JOINS } from "../services/ticketQueries";

const router = Router();

const MAX_PDF_ROWS = 2000; // a PDF with more rows becomes unwieldy; the newest tickets come first

function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The browser's time zone (decides how dates are printed). Anything odd falls back to UTC. */
function safeZone(v: unknown): string {
  const tz = qstr(v);
  if (!tz || tz.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// GET /api/export/tickets.pdf?status=&priority=&unit=&assignee=&q=&tz=Asia/Kuala_Lumpur
router.get(
  "/tickets.pdf",
  ah(async (req, res) => {
    const user = req.user!;
    const { conds, params } = buildTicketFilters(
      user,
      req.query as Record<string, unknown>,
    );
    const where = conds.join(" AND ");

    const total: number = (
      await query(
        `SELECT count(*)::int AS n FROM tickets t WHERE ${where}`,
        params,
      )
    ).rows[0].n;
    const r = await query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM tickets t ${TICKET_JOINS}
        WHERE ${where}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ${MAX_PDF_ROWS}`,
      params,
    );

    // A readable summary of the filters on the first page (the values were already validated above)
    const filters: string[] = [];
    const status = qstr(req.query.status);
    if (status) filters.push(`Status: ${STATUS_LABEL[status] ?? status}`);
    const priority = qstr(req.query.priority);
    if (priority)
      filters.push(`Priority: ${PRIORITY_LABEL[priority] ?? priority}`);
    const assignee = qstr(req.query.assignee);
    if (assignee === "unassigned") filters.push("Unassigned");
    if (assignee === "me") filters.push("Assigned to me");
    const unitRaw = qstr(req.query.unit);
    if (unitRaw && user.role === "ADMIN" && /^\d{1,15}$/.test(unitRaw)) {
      const u = await query("SELECT code FROM business_units WHERE id = $1", [
        Number(unitRaw),
      ]);
      if (u.rows[0]) filters.push(`Unit: ${u.rows[0].code}`);
    }
    const q = qstr(req.query.q).slice(0, 60);
    if (q) filters.push(`Search: "${q}"`);

    const now = new Date();
    const pdf = await buildTicketReportPdf({
      generatedBy: `${user.name} (${user.role})`,
      generatedAt: now,
      timeZone: safeZone(req.query.tz),
      scope:
        user.role === "ADMIN"
          ? "All business units"
          : (user.branding?.name ?? "Your business unit"),
      filters,
      total,
      rows: r.rows,
    });

    // Leave a trace of who exported how many rows
    await audit(pool, {
      actorId: user.id,
      action: "TICKETS_EXPORTED",
      entityType: "export",
      entityId: "tickets",
      details: { rows: r.rows.length, format: "PDF" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets-${now.toISOString().slice(0, 10)}.pdf"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  }),
);

export default router;
