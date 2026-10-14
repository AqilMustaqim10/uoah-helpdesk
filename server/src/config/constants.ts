// Fixed lists and rules shared across the whole backend.
// Keeping them in one file means the rules can never disagree between files.

// ----- Roles -----
export const ROLES = ["ADMIN", "IT", "USER"] as const;
export type Role = (typeof ROLES)[number];

// ----- The six business units -----
export const UNIT_CODES = [
  "CCEC",
  "FNB",
  "HOTEL",
  "KLBS",
  "KLW",
  "HQ",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

// ----- Ticket status and priority -----
export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

// Priority default for web tickets made by a USER. Only IT/ADMIN may choose or change priority.
export const DEFAULT_PRIORITY: Priority = "MEDIUM";

// ----- Knowledge base article status -----
export const ARTICLE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Allowed status moves: key = current status, value = statuses it may move to. CLOSED has none. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED", "OPEN"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

/** Hours after creation before an OPEN/IN_PROGRESS ticket is "overdue" (only when no manual due date is set). */
export const OVERDUE_HOURS: Record<Priority, number> = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

/** Names used by the seed script to create the six units. */
export const UNIT_DEFAULTS: ReadonlyArray<{ code: UnitCode; name: string }> = [
  { code: "CCEC", name: "Convention Centre & Events Corp" },
  { code: "FNB", name: "Food & Beverage" },
  { code: "HOTEL", name: "Hotel & Hospitality Group" },
  { code: "KLBS", name: "Building Services & Facilities" },
  { code: "KLW", name: "Corporate Office Tower" },
  { code: "HQ", name: "Group IT Headquarters" },
];

/** Upload limits. */
export const FILE_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024, // 10 MB per attachment
  maxLogoBytes: 1 * 1024 * 1024, // 1 MB per logo
  maxFilesPerItem: 10, // per ticket / comment / article
} as const;

/** List pagination: how many rows per page. */
export const PAGINATION = {
  defaultPageSize: 25,
  maxPageSize: 100,
} as const;
