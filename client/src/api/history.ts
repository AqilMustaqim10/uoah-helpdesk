// Ticket History server calls (they match server/src/routes/history.ts). ADMIN and IT only. Read-only.
import { api } from "./client";
import type { Priority, Role } from "../types";

export type HistoryStatus = "RESOLVED" | "CLOSED";

/** One finished ticket in the list. */
export interface HistoryRow {
  id: number;
  title: string;
  status: HistoryStatus;
  priority: Priority;
  source: "WEB" | "EMAIL";
  business_unit_id: number;
  unit_code: string;
  unit_name: string;
  requester_name: string;
  requester_department: string | null;
  assignee_name: string | null;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  /** When it was closed (or resolved). */
  finished_at: string;
  file_count: number;
}

export interface HistoryComment {
  id: number;
  body: string;
  source: "WEB" | "EMAIL";
  created_at: string;
  author_id: number;
  author_name: string;
  author_role: Role;
}

export interface HistoryFile {
  id: number;
  comment_id: number | null;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
  uploader_name: string;
}

export interface HistoryDetailResponse {
  ticket: HistoryRow & { description: string; requester_email: string };
  comments: HistoryComment[];
  files: HistoryFile[];
  /** Only a hint for the screen. The server decides what may be changed. */
  canManage: boolean;
}

export interface HistoryListResponse {
  tickets: HistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<HistoryStatus, number>;
}

/** The filters on the page. Empty string = "no filter". from / to are dates like 2026-10-16. */
export interface HistoryQuery {
  q: string;
  status: "" | HistoryStatus;
  priority: "" | Priority;
  unit: string;
  from: string;
  to: string;
  page: number;
}

function toQueryString(q: HistoryQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.priority) p.set("priority", q.priority);
  if (q.unit) p.set("unit", q.unit);
  // The chosen days become exact moments in YOUR time zone (start of the first day, end of the last)
  if (q.from) p.set("from", new Date(`${q.from}T00:00:00`).toISOString());
  if (q.to) p.set("to", new Date(`${q.to}T23:59:59.999`).toISOString());
  p.set("page", String(q.page));
  return p.toString();
}

// There is deliberately no function here that changes anything.
export const historyApi = {
  list: (q: HistoryQuery) =>
    api.get<HistoryListResponse>(`/history?${toQueryString(q)}`),
  get: (id: number) => api.get<HistoryDetailResponse>(`/history/${id}`),
};
