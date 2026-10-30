import { query } from "../db/pool";
import type { PeriodRange } from "./reportPeriod";

export interface TicketClosuresByAgent {
  agent_id: number;
  agent_name: string;
  total_closed: number;
}

/**
 * Counts currently resolved or closed tickets by assigned IT agent.
 * The report period applies to the date the ticket was finished.
 */
export async function ticketClosuresByAgent(
  businessUnitId: number | null,
  period: PeriodRange,
  timeZone: string,
): Promise<TicketClosuresByAgent[]> {
  const conditions = [
    "t.status IN ('RESOLVED','CLOSED')",
    "u.role = 'IT'",
  ];
  const params: unknown[] = [];

  if (businessUnitId !== null) {
    params.push(businessUnitId);
    conditions.push(`t.business_unit_id = $${params.length}`);
  }

  if (period.start && period.end) {
    params.push(period.start, period.end, timeZone);
    const start = params.length - 2;
    const end = params.length - 1;
    const zone = params.length;
    const finishedAt =
      "CASE WHEN t.status = 'CLOSED' THEN COALESCE(t.closed_at, t.updated_at) " +
      "ELSE COALESCE(t.resolved_at, t.updated_at) END";
    conditions.push(
      `${finishedAt} >= (($${start}::date)::timestamp AT TIME ZONE $${zone}::text)`,
      `${finishedAt} < (($${end}::date)::timestamp AT TIME ZONE $${zone}::text)`,
    );
  }

  const result = await query(
    `SELECT u.id AS agent_id, u.name AS agent_name, count(*)::int AS total_closed
       FROM tickets t
       JOIN users u ON u.id = t.assigned_to
      WHERE ${conditions.join(" AND ")}
      GROUP BY u.id, u.name
      ORDER BY total_closed DESC, u.name, u.id`,
    params,
  );
  return result.rows;
}
