// Shared TypeScript shapes. They match what the server sends back.

export type Role = "ADMIN" | "IT" | "USER";

/** Business unit branding (logo, color, text) as part of the logged-in user. */
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
  two_factor?: boolean;
}

/** A business unit in dropdowns. */
export interface UnitOption {
  id: number;
  code: string;
  name: string;
}

/** The sidebar tabs. */
export type TabKey =
  | "dashboard"
  | "tickets"
  | "history"
  | "kb"
  | "users"
  | "settings";
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
  requester_department?: string | null;
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
  activeOnly?: boolean;
  overdueOnly?: boolean;
  createdWithin?: "" | "7" | "30" | "90";
}

export interface DashboardFilters {
  unit: string;
  status: "" | TicketStatus;
  priority: "" | Priority;
  createdWithin: "" | "7" | "30" | "90";
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
  byUnit: Array<{ id: number; code: string; name: string; n: number }>;
  /** Up to five of the oldest overdue tickets. */
  overdueTickets: TicketSummary[];
}

// ---------------- User Directory ----------------

/** One person in the User Directory. */
export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  department?: string | null;
  two_factor?: boolean;
  business_unit_id: number | null;
  unit_code: string | null;
  unit_name: string | null;
  created_at: string;
}

export interface UserListResponse {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserQuery {
  q: string;
  role: "" | Role;
  status: "" | "active" | "disabled";
  unit: string; // '' = all, 'none' = no unit, or a unit id
  page: number;
}

// ---------------- Branding (Settings) ----------------

/** A business unit with its branding, as shown in Settings (snake_case, straight from the server). */
export interface UnitBranding {
  id: number;
  code: string;
  name: string;
  brand_color: string;
  brand_text: string;
  logo_version: number;
  has_logo: boolean;
}

// ---------------- Knowledge Base ----------------

export type ArticleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** One card in the article list. */
export interface ArticleSummary {
  id: number;
  title: string;
  status: ArticleStatus;
  tags: string[];
  business_unit_id: number | null; // null = global (all units)
  unit_code: string | null;
  unit_name: string | null;
  created_by: number;
  author_name: string;
  updated_by: number;
  editor_name: string;
  created_at: string;
  updated_at: string;
  excerpt: string;
}

/** A whole article. can_edit is only a hint for showing buttons; the server decides. */
export interface ArticleDetail extends Omit<ArticleSummary, "excerpt"> {
  body: string;
  can_edit: boolean;
}

export interface ArticleFile {
  id: number;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: number;
  uploader_name: string;
}

export interface ArticleDetailResponse {
  article: ArticleDetail;
  files: ArticleFile[];
}

export interface ArticleListResponse {
  articles: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArticleQuery {
  q: string;
  status: "" | ArticleStatus;
  unit: string; // '' = all, 'global' = global only, or a unit id
  page: number;
}

/** What the editor sends. business_unit_id: null = global (ADMIN only). */
export interface ArticleInput {
  title: string;
  body: string;
  status: ArticleStatus;
  tags: string[];
  business_unit_id?: number | null;
}
