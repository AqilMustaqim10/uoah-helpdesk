// The sidebar tabs and which roles may see each one.
// This only controls what is SHOWN. The server enforces the real permissions.
// New in step I: IT also sees the User Directory (a limited version: only their own unit).
import {
  BookOpen,
  History as HistoryIcon,
  LayoutDashboard,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role, TabKey } from "../types";

export interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Text on the temporary "coming soon" card (no longer used, kept for the placeholder page). */
  soon: string;
}

export const TABS: TabDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "IT"],
    soon: "Ticket statistics and trends.",
  },
  {
    key: "tickets",
    label: "Tickets",
    icon: Ticket,
    roles: ["ADMIN", "IT", "USER"],
    soon: "The ticket list and Create Ticket arrive in the next step.",
  },
  {
    key: "history",
    label: "Ticket History",
    icon: HistoryIcon,
    roles: ["ADMIN", "IT"], // standard users never see this tab
    soon: "Resolved and closed tickets of every business unit.",
  },
  {
    key: "kb",
    label: "Knowledge Base",
    icon: BookOpen,
    roles: ["ADMIN", "IT", "USER"],
    soon: "Articles and guides will appear here in a later step.",
  },
  {
    key: "users",
    label: "User Directory",
    icon: Users,
    roles: ["ADMIN", "IT"],
    soon: "User management will appear here in a later step.",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    roles: ["ADMIN"],
    soon: "Business unit branding will appear here in a later step.",
  },
];

export const TAB_STORAGE_KEY = "activeTab";

export function tabsForRole(role: Role): TabDef[] {
  return TABS.filter((t) => t.roles.includes(role));
}

/** IT and ADMIN land on the dashboard, everyone else on their tickets. */
export function defaultTabFor(role: Role): TabKey {
  return role === "USER" ? "tickets" : "dashboard";
}
