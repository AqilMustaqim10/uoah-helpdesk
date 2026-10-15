// Server calls for tickets (they match server/src/routes/tickets.ts, comments.ts, ticketFiles.ts, files.ts, export.ts).
import { api } from "./client";
import type {
  Assignee,
  Priority,
  TicketDetailResponse,
  TicketListResponse,
  TicketQuery,
  TicketStatus,
} from "../types";

/** Turns the filters into "q=...&status=..." (empty filters are left out). */
function toQueryString(q: TicketQuery, withPage = true): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.priority) p.set("priority", q.priority);
  if (q.unit) p.set("unit", q.unit);
  if (q.assignee) p.set("assignee", q.assignee);
  if (withPage) p.set("page", String(q.page));
  return p.toString();
}

export const ticketsApi = {
  list: (q: TicketQuery) =>
    api.get<TicketListResponse>(`/tickets?${toQueryString(q)}`),
  get: (id: number) => api.get<TicketDetailResponse>(`/tickets/${id}`),

  create: (body: {
    title: string;
    description: string;
    priority?: Priority;
    business_unit_id?: number;
  }) => api.post<TicketDetailResponse>("/tickets", body),

  setStatus: (id: number, status: TicketStatus) =>
    api.patch<TicketDetailResponse>(`/tickets/${id}/status`, { status }),
  setPriority: (id: number, priority: Priority) =>
    api.patch<TicketDetailResponse>(`/tickets/${id}/priority`, { priority }),
  setAssignee: (id: number, assignee_id: number | null) =>
    api.patch<TicketDetailResponse>(`/tickets/${id}/assignee`, { assignee_id }),
  setDue: (id: number, due_at: string | null) =>
    api.patch<TicketDetailResponse>(`/tickets/${id}/due`, { due_at }),

  assignees: (id: number) =>
    api.get<{ assignees: Assignee[] }>(`/tickets/${id}/assignees`),

  /** Text only -> JSON. With files -> a form (multipart), which is how files travel. */
  addComment: (
    id: number,
    body: string,
    is_internal: boolean,
    files: File[] = [],
  ) => {
    if (files.length === 0) {
      return api.post<TicketDetailResponse>(`/tickets/${id}/comments`, {
        body,
        is_internal,
      });
    }
    const form = new FormData();
    form.append("body", body);
    form.append("is_internal", String(is_internal));
    files.forEach((f) => form.append("files", f));
    return api.post<TicketDetailResponse>(`/tickets/${id}/comments`, form);
  },

  /** Attach files to the ticket itself. */
  uploadFiles: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return api.post<TicketDetailResponse>(`/tickets/${id}/files`, form);
  },

  deleteFile: (fileId: number) =>
    api.del<TicketDetailResponse>(`/files/${fileId}`),

  /** CSV of the tickets that match the current filters (IT/ADMIN only). */
  exportCsv: (q: TicketQuery) =>
    api.download(
      `/export/tickets.csv?${toQueryString(q, false)}`,
      "tickets.csv",
    ),
};
