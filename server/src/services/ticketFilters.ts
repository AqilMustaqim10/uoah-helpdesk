// Builds the WHERE conditions for "which tickets match these filters", used by the ticket list and PDF export.
// Visibility ALWAYS comes first and always from ticketScope().
// (The ticket list route has the same filter logic written inline; both rely on ticketScope.)
import { PRIORITIES, STATUSES } from "../config/constants";
import type { AuthUser } from "../middleware/auth";
import { HttpError } from "../lib/http";
import { escapeLike, overdueSql } from "../lib/sql";
import { bodyId, oneOf } from "../lib/validate";
import { ticketScope } from "../security/scope";

function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function addTicketActivityFilters(
  q: Record<string, unknown>,
  conds: string[],
  params: unknown[],
): void {
  const active = qstr(q.active);
  if (active && active !== "1") {
    throw new HttpError(400, "Invalid active filter.");
  }
  if (active === "1") conds.push("t.status IN ('OPEN','IN_PROGRESS')");

  const overdue = qstr(q.overdue);
  if (overdue && overdue !== "1") {
    throw new HttpError(400, "Invalid overdue filter.");
  }
  if (overdue === "1") conds.push(overdueSql("t"));

  const createdWithin = qstr(q.created_within);
  if (createdWithin) {
    if (!["7", "30", "90"].includes(createdWithin)) {
      throw new HttpError(400, "Invalid created date range.");
    }
    const days = Number(createdWithin);
    params.push(days);
    conds.push(
      `t.created_at >= now() - make_interval(days => $${params.length})`,
    );
  }
}

export function buildTicketFilters(user: AuthUser, q: Record<string, unknown>) {
  const conds: string[] = [];
  const params: unknown[] = [];

  // 1) Who may see what
  const scope = ticketScope(user, 1);
  conds.push(scope.sql);
  params.push(...scope.params);

  // 2) Optional filters (whitelisted or passed as parameters)
  const status = qstr(q.status);
  if (status) {
    params.push(oneOf(status, STATUSES, "status"));
    conds.push(`t.status = $${params.length}`);
  }

  const priority = qstr(q.priority);
  if (priority) {
    params.push(oneOf(priority, PRIORITIES, "priority"));
    conds.push(`t.priority = $${params.length}`);
  }

  addTicketActivityFilters(q, conds, params);

  const unit = qstr(q.unit);
  if (unit && user.role === "ADMIN") {
    params.push(bodyId(unit, "unit"));
    conds.push(`t.business_unit_id = $${params.length}`);
  }

  const assignee = qstr(q.assignee);
  if (assignee === "unassigned") {
    conds.push("t.assigned_to IS NULL");
  } else if (assignee === "me") {
    params.push(user.id);
    conds.push(`t.assigned_to = $${params.length}`);
  } else if (assignee) {
    throw new HttpError(400, "Invalid assignee filter.");
  }

  const text = qstr(q.q).slice(0, 100);
  if (text) {
    params.push(`%${escapeLike(text)}%`);
    const n = params.length;
    let c = `(t.title ILIKE $${n} OR t.description ILIKE $${n} OR t.requester_email ILIKE $${n}`;
    const m = /^(?:hd-?)?(\d{1,15})$/i.exec(text);
    if (m) {
      params.push(Number(m[1]));
      c += ` OR t.id = $${params.length}`;
    }
    conds.push(c + ")");
  }

  return { conds, params };
}
