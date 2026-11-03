// PDF export of tickets. Mounted at /api/export for IT/ADMIN only (index.ts), and scoped exactly like the list:
// buildTicketFilters() puts ticketScope() first, so an IT user only ever exports their own unit's tickets.
// The report can be limited to a business unit (bu), an IT staff member (ADMIN only), and a period
// (day, week, month or year, by the day each ticket was CREATED); the PDF header lists applied filters.
//   GET /api/export/tickets.pdf?bu=all|<id>&period=all|day|week|month|year
//                              &date=YYYY-MM-DD (day, week) &month=1-12&year=YYYY (month, year)
//                              &tz=Asia/Kuala_Lumpur  [&status=&priority=&assignee=&q=&it_staff=]
import { Router } from "express";
import { pool, query } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { bodyId } from "../lib/validate";
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
import { ticketClosuresByAgent } from "../services/ticketPerformance";
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
  "/it-staff",
  ah(async (req, res) => {
    if (req.user!.role !== "ADMIN") {
      throw new HttpError(403, "Only administrators can view IT staff.");
    }

    const result = await query(
      `SELECT u.id, u.name, u.is_active, u.business_unit_id,
              bu.code AS unit_code, bu.name AS unit_name
         FROM users u
         LEFT JOIN business_units bu ON bu.id = u.business_unit_id
        WHERE u.role = 'IT' AND u.deleted_at IS NULL
        ORDER BY u.is_active DESC, lower(u.name), u.id`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ staff: result.rows });
  }),
);

router.get(
  "/tickets.pdf",
  ah(async (req, res) => {
    const user = req.user!;
    const q = req.query as Record<string, unknown>;

    const itStaffFilter = qstr(q.it_staff);
    let selectedItStaff: {
      id: number;
      name: string;
      business_unit_id: number | null;
    } | null = null;
    if (itStaffFilter) {
      if (user.role !== "ADMIN") {
        throw new HttpError(
          403,
          "Only administrators can filter exports by IT staff.",
        );
      }

      const staffId = bodyId(itStaffFilter, "IT staff");
      const staffResult = await query(
        `SELECT id, name, business_unit_id
           FROM users
          WHERE id = $1 AND role = 'IT' AND deleted_at IS NULL`,
        [staffId],
      );
      selectedItStaff = staffResult.rows[0] ?? null;
      if (!selectedItStaff) throw new HttpError(400, "Invalid IT staff filter.");
      if (selectedItStaff.business_unit_id === null) {
        throw new HttpError(
          400,
          "The selected IT staff member has no business unit.",
        );
      }
    }

    // Selecting an IT staff member automatically scopes the export to their business unit.
    const unit = await resolveBusinessUnit(
      user,
      selectedItStaff
        ? String(selectedItStaff.business_unit_id)
        : (q.bu ?? q.unit),
    );
    const period = resolvePeriod(q);
    const tz = await dbTimeZone(q.tz);
    // The logo for this report: the chosen unit's own logo (IT: always their own unit's), the group logo for "all units",
    // or a colored badge when there is no usable picture. Never fails the export.
    const logo = await reportLogoFor(unit.id);

    // Visibility (ticketScope, first) and the other list filters, from the ONE shared builder
    const { conds, params } = buildTicketFilters(user, {
      ...q,
      unit: unit.id ? String(unit.id) : "",
    });

    if (selectedItStaff) {
      params.push(selectedItStaff.id);
      conds.push(`t.assigned_to = $${params.length}`);
    }

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
    const agentPerformance = await ticketClosuresByAgent(
      unit.id,
      period,
      tz,
      selectedItStaff?.id,
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
    if (selectedItStaff) filters.push(`IT staff: ${selectedItStaff.name}`);
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
      agentPerformance,
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
        itStaffId: selectedItStaff?.id ?? null,
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
