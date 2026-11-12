// Names, colors and allowed moves for ticket statuses and priorities.
// Only slate, emerald, amber, rose and indigo are used, because dark mode remaps exactly those.
// The TRANSITIONS here only decide which buttons are SHOWN. The server enforces the real rules.
import {
  CheckCircle2,
  CircleDot,
  Clock,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { Priority, TicketStatus } from "../types";

export const STATUS_ORDER: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

export const STATUS_META: Record<
  TicketStatus,
  { label: string; chip: string; icon: LucideIcon }
> = {
  OPEN: {
    label: "Open",
    chip: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
    icon: CircleDot,
  },
  IN_PROGRESS: {
    label: "In progress",
    chip: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800",
    icon: Clock,
  },
  RESOLVED: {
    label: "Resolved",
    chip: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
    icon: CheckCircle2,
  },
  CLOSED: {
    label: "Closed",
    chip: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-800",
    icon: Lock,
  },
};

export const PRIORITY_LIST: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const SLA_TARGET_HOURS: Record<Priority, number> = {
  LOW: 72,
  MEDIUM: 24,
  HIGH: 8,
  URGENT: 4,
};

export const PRIORITY_META: Record<Priority, { label: string; chip: string }> =
  {
    LOW: { label: "Low", chip: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-800" },
    MEDIUM: {
      label: "Medium",
      chip: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-300 dark:ring-slate-700",
    },
    HIGH: {
      label: "High",
      chip: "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-800",
    },
    URGENT: { label: "Urgent", chip: "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-800" },
  };

/** Buttons shown for each current status. */
export const TRANSITIONS: Record<
  TicketStatus,
  Array<{ to: TicketStatus; label: string; primary?: boolean }>
> = {
  OPEN: [{ to: "IN_PROGRESS", label: "Start work", primary: true }],
  IN_PROGRESS: [
    { to: "RESOLVED", label: "Mark resolved", primary: true },
    { to: "OPEN", label: "Move back to Open" },
  ],
  RESOLVED: [
    { to: "CLOSED", label: "Close ticket", primary: true },
    { to: "IN_PROGRESS", label: "Reopen work" },
  ],
  CLOSED: [],
};
