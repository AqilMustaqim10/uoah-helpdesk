// Turns one audit log row into a readable sentence ("changed the status from Open to In progress").
// Unknown actions fall back to a cleaned-up version of their name.
import { formatDateTime } from "./format";
import { PRIORITY_META, STATUS_META } from "./ticketMeta";
import type { Priority, TicketStatus } from "../types";

/** USER_ROLE_CHANGED -> "User role changed" */
export function humanizeAction(action: string): string {
  const s = action.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const text = (v: unknown, fallback = "?"): string =>
  v === null || v === undefined || v === "" ? fallback : String(v);

export function describeAudit(action: string, d: Record<string, any>): string {
  const status = (s: unknown) =>
    STATUS_META[s as TicketStatus]?.label ?? text(s);
  const priority = (s: unknown) =>
    PRIORITY_META[s as Priority]?.label ?? text(s);

  switch (action) {
    // ----- tickets -----
    case "TICKET_CREATED":
      return d.source === "EMAIL"
        ? "created a ticket from an email"
        : "created the ticket";
    case "TICKET_STATUS_CHANGED":
      return `changed the status from ${status(d.from)} to ${status(d.to)}`;
    case "TICKET_PRIORITY_CHANGED":
      return `changed the priority from ${priority(d.from)} to ${priority(d.to)}`;
    case "TICKET_ASSIGNED":
      return d.to_name
        ? `assigned the ticket to ${d.to_name}`
        : "removed the assignee";
    case "TICKET_DUE_CHANGED":
      return d.to
        ? `set the due date to ${formatDateTime(String(d.to))}`
        : "cleared the due date";
    case "COMMENT_ADDED":
      return `${d.internal ? "added an internal note" : "replied"}${d.source === "EMAIL" ? " by email" : ""}`;
    case "FILE_ADDED":
      return `attached ${text(d.name, "a file")}`;
    case "FILE_REMOVED":
      return `removed ${text(d.name, "a file")}`;
    case "TICKETS_EXPORTED":
      return `exported ${text(d.rows, "0")} ticket(s) to ${text(d.format, "CSV")}${d.unit ? ` (${text(d.unit)}, ${text(d.period, "all")})` : ""}`;
    // ----- people -----
    case "USER_REGISTERED":
      return `registered the account ${text(d.email)}`;
    case "USER_SEEDED_ADMIN":
      return `created the first administrator ${text(d.email)}`;
    case "PASSWORD_RESET":
      return "reset their password";
    case "USER_ROLE_CHANGED":
      return `changed the role of ${text(d.email)} from ${text(d.from)} to ${text(d.to)}`;
    case "USER_UNIT_CHANGED":
      return `moved ${text(d.email)} from ${text(d.from, "no unit")} to ${text(d.to)}`;
    case "USER_ENABLED":
      return `enabled the account of ${text(d.email)}`;
    case "USER_DISABLED":
      return `disabled the account of ${text(d.email)}`;

    // ----- branding -----
    case "UNIT_BRANDING_CHANGED":
      return `changed the branding of ${text(d.code)}`;
    case "UNIT_LOGO_CHANGED":
      return `changed the logo of ${text(d.code)}`;
    case "UNIT_LOGO_REMOVED":
      return `removed the logo of ${text(d.code)}`;

    // ----- knowledge base -----
    case "ARTICLE_CREATED":
      return `created the article "${text(d.title)}"`;
    case "ARTICLE_UPDATED":
      return `edited an article (${Array.isArray(d.fields) ? d.fields.join(", ") : "changes"})`;
    case "ARTICLE_FILE_ADDED":
      return `attached ${text(d.name, "a file")} to an article`;
    case "ARTICLE_FILE_REMOVED":
      return `removed ${text(d.name, "a file")} from an article`;

    default:
    // ----- two-factor authentication -----
    case "MFA_ENABLED":
      return "turned on two-factor authentication";
    case "MFA_RECOVERY_USED":
      return `signed in with a recovery code (${text(d.left, "?")} left)`;
    case "MFA_RECOVERY_REGENERATED":
      return "created new recovery codes";
    case "MFA_LOCKED":
      return "was locked out for 15 minutes after wrong codes";
    case "MFA_RESET":
      return `reset two-factor authentication for ${text(d.email)}`;
      return humanizeAction(action).toLowerCase();

    // ----- deleting and creating -----
    case "TICKET_DELETED":
      return `permanently deleted ticket ${text(d.ref)} "${text(d.title)}" (${text(d.comments, "0")} replies, ${text(d.files, "0")} files). Reason: ${text(d.reason)}`;
    case "USER_CREATED":
      return `created the account ${text(d.email)} (${text(d.role)}, ${text(d.department, "no department")})`;
    case "USER_DELETED":
      return `deleted the account of ${text(d.email)}. Reason: ${text(d.reason)}`;
    case "USER_DEPARTMENT_CHANGED":
      return `changed the department of ${text(d.email)} from ${text(d.from, "none")} to ${text(d.to)}`;

    // ----- departments -----
    case "DEPARTMENT_CREATED":
      return `added the department "${text(d.name)}"`;
    case "DEPARTMENT_RENAMED":
      return `renamed the department "${text(d.from)}" to "${text(d.to)}" (${text(d.people, "0")} people updated)`;
    case "DEPARTMENT_HIDDEN":
      return `hid the department "${text(d.name)}"`;
    case "DEPARTMENT_SHOWN":
      return `showed the department "${text(d.name)}" again`;
    case "DEPARTMENT_DELETED":
      return `deleted the department "${text(d.name)}"${d.moved_to ? ` and moved ${text(d.people, "0")} people to "${text(d.moved_to)}"` : ""}`;

    // ----- ticket history -----
    case "TICKET_HISTORY_VIEWED":
      return `opened ${text(d.ref)} of ${text(d.unit)} in the ticket history`;
  }
}
