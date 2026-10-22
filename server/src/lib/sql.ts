// Small SQL helpers shared by several routes.
import { OVERDUE_HOURS } from "../config/constants";

/** Display id of a ticket: 12 -> "HD-12". */
export const ticketRef = (id: number): string => `HD-${id}`;

/**
 * SQL condition that is TRUE when a ticket is overdue:
 *  - only OPEN / IN_PROGRESS tickets can be overdue
 *  - deadline = the manual due date if one is set, otherwise created time + a priority rule
 *    (URGENT 4h, HIGH 8h, MEDIUM 24h, LOW 72h; see OVERDUE_HOURS in constants.ts)
 * The numbers come from our own constants (never from users), so building the text here is safe.
 */
export function overdueSql(alias = "t"): string {
  const cases = Object.entries(OVERDUE_HOURS)
    .map(
      ([priority, hours]) =>
        `WHEN '${priority}' THEN interval '${hours} hours'`,
    )
    .join(" ");
  return (
    `(${alias}.status IN ('OPEN','IN_PROGRESS') AND ` +
    `COALESCE(${alias}.due_at, ${alias}.created_at + (CASE ${alias}.priority ${cases} END)) < now())`
  );
}

/** Escapes % and _ so a search word is treated as plain text inside ILIKE. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}
