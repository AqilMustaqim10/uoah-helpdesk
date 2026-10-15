// Numbers for the Dashboard. Mounted at /api/stats for IT/ADMIN only (index.ts).
// EVERY query below is limited by ticketScope(), so an IT user only ever counts their own unit.
import { Router } from "express";
import { query } from "../db/pool";
import { ah } from "../lib/http";
import { overdueSql } from "../lib/sql";
import { PRIORITIES } from "../config/constants";
import { ticketScope } from "../security/scope";
import { SUMMARY_COLUMNS, TICKET_JOINS } from "../services/ticketQueries";

const router = Router();

// GET /api/stats
router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;
    const scope = ticketScope(user, 1, "t");

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
        WHERE ${scope.sql}`,
      scope.params,
    );

    // Priority breakdown of ACTIVE tickets (Open + In progress)
    const p = await query(
      `SELECT t.priority, count(*)::int AS n
         FROM tickets t
        WHERE ${scope.sql} AND t.status IN ('OPEN','IN_PROGRESS')
        GROUP BY t.priority`,
      scope.params,
    );
    const byPriority: Record<string, number> = {};
    for (const name of PRIORITIES) byPriority[name] = 0;
    for (const row of p.rows) byPriority[row.priority] = row.n;

    // Unit breakdown of ACTIVE tickets (only ADMIN sees more than one unit)
    let byUnit: Array<{ code: string; name: string; n: number }> = [];
    if (user.role === "ADMIN") {
      const u = await query(
        `SELECT bu.code, bu.name, count(t.id)::int AS n
           FROM business_units bu
           LEFT JOIN tickets t
                  ON t.business_unit_id = bu.id AND t.status IN ('OPEN','IN_PROGRESS') AND ${scope.sql}
          GROUP BY bu.id
          ORDER BY n DESC, bu.code`,
        scope.params,
      );
      byUnit = u.rows;
    }

    // The five oldest overdue tickets, for the banner
    const od = await query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM tickets t ${TICKET_JOINS}
        WHERE ${scope.sql} AND ${overdueSql("t")}
        ORDER BY t.created_at ASC
        LIMIT 5`,
      scope.params,
    );

    res.json({ kpis: k.rows[0], byPriority, byUnit, overdueTickets: od.rows });
  }),
);

export default router;
