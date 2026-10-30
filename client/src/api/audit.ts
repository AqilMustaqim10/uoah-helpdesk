// Audit log viewer server calls (they match server/src/routes/audit.ts).
import { api } from "./client";

export interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  ticket_id: number | null;
  details: Record<string, any>;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  business_unit_code: string | null;
  business_unit_name: string | null;
}

export interface AuditListResponse {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** The filters on the page. Empty string = "no filter". from / to are dates like 2026-10-16. */
export interface AuditQuery {
  actor: string;
  businessUnit: string;
  action: string;
  entity: string;
  ticket: string;
  from: string;
  to: string;
  page: number;
}

function toQueryString(q: AuditQuery): string {
  const p = new URLSearchParams();
  if (q.actor.trim()) p.set("actor", q.actor.trim());
  if (q.businessUnit) p.set("bu", q.businessUnit);
  if (q.action) p.set("action", q.action);
  if (q.entity) p.set("entity", q.entity);
  if (q.ticket.trim()) p.set("ticket", q.ticket.trim());
  // The chosen days are turned into exact moments in YOUR time zone (start of the first day, end of the last)
  if (q.from) p.set("from", new Date(`${q.from}T00:00:00`).toISOString());
  if (q.to) p.set("to", new Date(`${q.to}T23:59:59.999`).toISOString());
  p.set("page", String(q.page));
  return p.toString();
}

export const auditApi = {
  list: (q: AuditQuery) =>
    api.get<AuditListResponse>(`/audit?${toQueryString(q)}`),
  actions: () => api.get<{ actions: string[] }>("/audit/actions"),
};
