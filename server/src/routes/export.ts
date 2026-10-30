// PDF export of tickets. Mounted at /api/export for IT/ADMIN only (index.ts), and scoped exactly like the list:
// buildTicketFilters() puts ticketScope() first, so an IT user only ever exports their own unit's tickets.
// New: the report can be limited to a business unit (bu) and to a period (day, week, month or year, by the
// day each ticket was CREATED), and the PDF header says which filters were applied.
//   GET /api/export/tickets.pdf?bu=all|<id>&period=all|day|week|month|year
//                              &date=YYYY-MM-DD (day, week) &month=1-12&year=YYYY (month, year)
//                              &tz=Asia/Kuala_Lumpur  [&status=&priority=&assignee=&q=]
import { Router } from "express";
import { pool, query } from "../db/pool";
import { audit } from "../db/audit";
import { ah } from "../lib/http";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  buildTicketReportPdf,
} from "../services/pdfReport";
import {
  dbTimeZone,
  periodCondition,
  resolveBusinessUnit,
  resolvePeriod,
} from "../services/reportPeriod";
import { reportLogoFor } from "../services/unitLogo";
import { buildTicketFilters } from "../services/ticketFilters";
import { SUMMARY_COLUMNS, TICKET_JOINS } from "../services/ticketQueries";

const router = Router();

const MAX_PDF_ROWS = 2000; // a PDF with more rows becomes unwieldy; the newest tickets come first

function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Can JavaScript print dates in this time zone? (The time zone itself was already accepted by PostgreSQL.) */
function displayZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

router.get(
  "/tickets.pdf",
  ah(async (req, res) => {
    const user = req.user!;
    const q = req.query as Record<string, unknown>;

    // 1) Validate the new filters. Anything odd stops here with a 400 (or a 403 for another unit).
    const unit = await resolveBusinessUnit(user, q.bu ?? q.unit);
    const period = resolvePeriod(q);
    const tz = await dbTimeZone(q.tz);
    // The logo for this report: the chosen unit's own logo (IT: always their own unit's), the group logo for "all units",
    // or a colored badge when there is no usable picture. Never fails the export.
    const logo = await reportLogoFor(unit.id);

    // 2) Visibility (ticketScope, first) and the other list filters, from the ONE shared builder
    const { conds, params } = buildTicketFilters(user, {
      ...q,
      unit: unit.id ? String(unit.id) : "",
    });

    // 3) The period (a range of days in the person's time zone)
    const pc = periodCondition(period, tz, params.length + 1);
    if (pc) {
      conds.push(pc.sql);
      params.push(...pc.params);
    }
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

    // 4) A readable list of the OTHER filters (the unit and the period are in the header already)
    const filters: string[] = [];
    const status = qstr(q.status);
    if (status) filters.push(`Status: ${STATUS_LABEL[status] ?? status}`);
    const priority = qstr(q.priority);
    if (priority)
      filters.push(`Priority: ${PRIORITY_LABEL[priority] ?? priority}`);
    if (q.active === "1") filters.push("Active tickets");
    if (q.overdue === "1") filters.push("Overdue tickets");
    const createdWithin = qstr(q.created_within);
    if (createdWithin)
      filters.push(`Created within last ${createdWithin} days`);
    const assignee = qstr(q.assignee);
    if (assignee === "unassigned") filters.push("Unassigned");
    if (assignee === "me") filters.push("Assigned to me");
    const search = qstr(q.q).slice(0, 60);
    if (search) filters.push(`Search: "${search}"`);

    const now = new Date();
    const pdf = await buildTicketReportPdf({
      generatedBy: `${user.name} (${user.role})`,
      generatedAt: now,
      timeZone: displayZone(tz),
      scope: unit.label,
      subtitle: `Report for: ${unit.label} - ${period.label}`,
      periodLine:
        period.type === "all"
          ? "All dates (by the day each ticket was created)"
          : `Tickets created ${period.rangeText}`,
      filters,
      total,
      rows: r.rows,
      logo: {
        image: logo.image,
        badgeText: logo.badgeText,
        badgeColor: logo.badgeColor,
      },
    });

    // Leave a trace of who exported what
    await audit(pool, {
      actorId: user.id,
      action: "TICKETS_EXPORTED",
      entityType: "export",
      entityId: "tickets",
      details: {
        rows: r.rows.length,
        format: "PDF",
        unit: unit.code ?? "ALL",
        period: period.slug,
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets-${unit.code ?? "all"}-${period.slug}.pdf"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  }),
);

// GET /api/export/logo-preview?bu=all|<id>
// Exactly what the PDF header will show for this choice (the same checked picture, or the same badge),
// so the export window can preview it. IT can only ask about their own unit (another unit gives 403).
router.get(
  "/logo-preview",
  ah(async (req, res) => {
    const unit = await resolveBusinessUnit(
      req.user!,
      (req.query as Record<string, unknown>).bu,
    );
    const logo = await reportLogoFor(unit.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      unit: unit.label,
      hasImage: logo.image !== null,
      // The picture travels inside the answer, so no extra picture address has to be protected
      imageDataUrl:
        logo.image && logo.mime
          ? `data:${logo.mime};base64,${logo.image.toString("base64")}`
          : null,
      badgeText: logo.badgeText,
      badgeColor: logo.badgeColor,
      problem: logo.problem,
    });
  }),
);

export default router;
