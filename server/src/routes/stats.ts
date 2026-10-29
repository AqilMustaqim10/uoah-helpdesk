// Numbers for the Dashboard. Mounted at /api/stats for IT/ADMIN only (index.ts).
// EVERY query below is limited by ticketScope(), so an IT user only ever counts their own unit.
// New in step G: "trend" = tickets created and resolved per day for the last 30 days.
import { Router } from "express";
import { query } from "../db/pool";
import { ah } from "../lib/http";
import { overdueSql } from "../lib/sql";
import { PRIORITIES, STATUSES } from "../config/constants";
import { bodyId, oneOf } from "../lib/validate";
import { ticketScope } from "../security/scope";
import { SUMMARY_COLUMNS, TICKET_JOINS } from "../services/ticketQueries";
import { addTicketActivityFilters } from "../services/ticketFilters";

const router = Router();

const TREND_DAYS = 30;

/**
 * The time zone used to decide which DAY a ticket belongs to. The browser sends its own zone
 * (for example Asia/Kuala_Lumpur). Anything unknown or odd falls back to UTC, so a bad value can never break the page.
 */
async function resolveTimeZone(v: unknown): Promise<string> {
  const tz = typeof v === "string" ? v.trim() : "";
  if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return "UTC";
  const r = await query("SELECT 1 FROM pg_timezone_names WHERE name = $1", [
    tz,
  ]);
  return r.rows[0] ? tz : "UTC";
}

// GET /api/stats?tz=Asia/Kuala_Lumpur
router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;
    const scope = ticketScope(user, 1, "t");
    const conds = [scope.sql];
    const params: unknown[] = [...scope.params];
    const unit = typeof req.query.unit === "string" ? req.query.unit.trim() : "";
    let unitParam: number | null = null;
    if (unit && user.role === "ADMIN") {
      params.push(bodyId(unit, "unit"));
      unitParam = params.length;
      conds.push(`t.business_unit_id = $${params.length}`);
    }

    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : "";
    if (status) {
      params.push(oneOf(status, STATUSES, "status"));
      conds.push(`t.status = $${params.length}`);
    }

    const priority =
      typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    if (priority) {
      params.push(oneOf(priority, PRIORITIES, "priority"));
      conds.push(`t.priority = $${params.length}`);
    }
    addTicketActivityFilters(req.query, conds, params);
    const where = conds.join(" AND ");
    const activeStatusCondition = status
      ? ""
      : " AND t.status IN ('OPEN','IN_PROGRESS')";

    // KPI cards + overdue count in one pass
    const k = await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE t.status = 'OPEN')::int AS open,
              count(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
              count(*) FILTER (WHERE t.status = 'RESOLVED')::int AS resolved,
              count(*) FILTER (WHERE t.status = 'CLOSED')::int AS closed,
              count(*) FILTER (WHERE t.priority = 'URGENT' AND t.status IN ('OPEN','IN_PROGRESS'))::int AS urgent,
              count(*) FILTER (WHERE ${overdueSql("t")})::int AS overdue
         FROM tickets t
        WHERE ${where}`,
      params,
    );

    // Priority breakdown of ACTIVE tickets (Open + In progress)
    const p = await query(
      `SELECT t.priority, count(*)::int AS n
         FROM tickets t
        WHERE ${where}${activeStatusCondition}
        GROUP BY t.priority`,
      params,
    );
    const byPriority: Record<string, number> = {};
    for (const name of PRIORITIES) byPriority[name] = 0;
    for (const row of p.rows) byPriority[row.priority] = row.n;

    // Unit breakdown of ACTIVE tickets (only ADMIN sees more than one unit)
    let byUnit: Array<{ id: number; code: string; name: string; n: number }> = [];
    if (user.role === "ADMIN") {
      const u = await query(
        `SELECT bu.id, bu.code, bu.name, count(t.id)::int AS n
           FROM business_units bu
           LEFT JOIN tickets t
                  ON t.business_unit_id = bu.id${activeStatusCondition} AND ${where}
          ${unitParam === null ? "" : `WHERE bu.id = $${unitParam}`}
          GROUP BY bu.id
          ORDER BY n DESC, bu.code`,
        params,
      );
      byUnit = u.rows;
    }

    // The five oldest overdue tickets, for the banner
    const od = await query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM tickets t ${TICKET_JOINS}
        WHERE ${where} AND ${overdueSql("t")}
        ORDER BY t.created_at ASC
        LIMIT 5`,
      params,
    );

    // Trend: one row for each of the last 30 days (days with nothing show 0).
    //  - created  = tickets created that day
    //  - resolved = tickets whose current "resolved" moment falls on that day
    //               (a ticket sent back to Open stops counting until it is resolved again)
    // The same ticketScope() limits both counts. Only OUR code builds this text; the zone travels as a parameter.
    const tz = await resolveTimeZone(req.query.tz);
    const tzParams = [...params, tz];
    const zone = `$${tzParams.length}::text`;
    const trend = await query(
      `WITH days AS (
         SELECT ((now() AT TIME ZONE ${zone})::date - gs) AS day
           FROM generate_series(0, ${TREND_DAYS - 1}) AS gs
       ),
       made AS (
         SELECT (t.created_at AT TIME ZONE ${zone})::date AS day, count(*)::int AS n
           FROM tickets t
          WHERE ${where} AND t.created_at >= now() - interval '${TREND_DAYS + 2} days'
          GROUP BY 1
       ),
       fixed AS (
         SELECT (t.resolved_at AT TIME ZONE ${zone})::date AS day, count(*)::int AS n
           FROM tickets t
          WHERE ${where} AND t.resolved_at IS NOT NULL
            AND t.resolved_at >= now() - interval '${TREND_DAYS + 2} days'
          GROUP BY 1
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              COALESCE(made.n, 0) AS created,
              COALESCE(fixed.n, 0) AS resolved
         FROM days
         LEFT JOIN made ON made.day = days.day
         LEFT JOIN fixed ON fixed.day = days.day
        ORDER BY days.day`,
      tzParams,
    );

    res.json({
      kpis: k.rows[0],
      byPriority,
      byUnit,
      overdueTickets: od.rows,
      trend: trend.rows,
    });
  }),
);

export default router;
