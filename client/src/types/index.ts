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

/** An attachment. comment_id = null means it is attached to the ticket itself. */
export interface TicketFile {
  id: number;
  comment_id: number | null;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: number;
  uploader_name: string;
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
  files: TicketFile[];
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

// ---------------- Dashboard ----------------

export interface DashboardStats {
  kpis: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    urgent: number;
    overdue: number;
  };
  /** Active tickets (Open + In progress) per priority. */
  byPriority: Record<Priority, number>;
  /** Active tickets per business unit (ADMIN only; empty for IT). */
  byUnit: Array<{ code: string; name: string; n: number }>;
  /** Up to five of the oldest overdue tickets. */
  overdueTickets: TicketSummary[];
}
