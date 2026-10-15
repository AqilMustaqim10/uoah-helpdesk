// Shared TypeScript shapes. They match what the server sends back.

export type Role = "ADMIN" | "IT" | "USER";

/** Business unit branding (logo, color, text). */
export interface Branding {
  unitId: number;
  code: string;
  name: string;
  brandColor: string;
  brandText: string;
  logoVersion: number;
  hasLogo: boolean;
}

/** The logged-in user as sent by /api/auth/me. */
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  business_unit_id: number | null;
  branding: Branding | null;
}

/** A business unit in dropdowns. */
export interface UnitOption {
  id: number;
  code: string;
  name: string;
}

/** The sidebar tabs. */
export type TabKey = "dashboard" | "tickets" | "kb" | "users" | "settings";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

// ---------------- Tickets ----------------

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/** One row of the ticket list. */
export interface TicketSummary {
  id: number;
  title: string;
  status: TicketStatus;
  priority: Priority;
  source: "WEB" | "EMAIL";
  business_unit_id: number;
  unit_code: string;
  unit_name: string;
  created_by: number;
  requester_name: string;
  requester_email: string;
  assigned_to: number | null;
  assignee_name: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  is_overdue: boolean;
  file_count: number;
}

/** A single ticket (adds the description). */
export interface TicketDetail extends TicketSummary {
  description: string;
}

export interface CommentItem {
  id: number;
  body: string;
  is_internal: boolean;
  source: "WEB" | "EMAIL";
  created_at: string;
  author_id: number;
  author_name: string;
  author_role: Role;
}

export interface HistoryItem {
  id: number;
  action: string;
  details: Record<string, any>;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
  comments: CommentItem[];
  /** null for USER (history is IT/ADMIN only). */
  history: HistoryItem[] | null;
}

export interface TicketListResponse {
  tickets: TicketSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<TicketStatus, number>;
}

/** A person a ticket can be assigned to. */
export interface Assignee {
  id: number;
  name: string;
  role: Role;
}

/** The filters on the Tickets page. Empty string = "no filter". */
export interface TicketQuery {
  q: string;
  status: "" | TicketStatus;
  priority: "" | Priority;
  unit: string;
  assignee: "" | "unassigned" | "me";
  page: number;
}
