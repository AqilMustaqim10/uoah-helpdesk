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
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: CircleDot,
  },
  IN_PROGRESS: {
    label: "In progress",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: Clock,
  },
  RESOLVED: {
    label: "Resolved",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: CheckCircle2,
  },
  CLOSED: {
    label: "Closed",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    icon: Lock,
  },
};

export const PRIORITY_LIST: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const PRIORITY_META: Record<Priority, { label: string; chip: string }> =
  {
    LOW: { label: "Low", chip: "bg-slate-100 text-slate-500 ring-slate-200" },
    MEDIUM: {
      label: "Medium",
      chip: "bg-slate-100 text-slate-700 ring-slate-300",
    },
    HIGH: {
      label: "High",
      chip: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    },
    URGENT: { label: "Urgent", chip: "bg-rose-50 text-rose-700 ring-rose-200" },
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
