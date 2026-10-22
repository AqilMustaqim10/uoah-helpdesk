// Small colored pills: status, priority and "Overdue".
import { AlarmClock } from "lucide-react";
import type { Priority, TicketStatus } from "../../types";
import { PRIORITY_META, STATUS_META } from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";

const BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn(BASE, meta.chip)}>
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return <span className={cn(BASE, meta.chip)}>{meta.label}</span>;
}

export function OverdueBadge() {
  return (
    <span className={cn(BASE, "bg-rose-50 text-rose-700 ring-rose-200")}>
      <AlarmClock className="h-3 w-3" aria-hidden />
      Overdue
    </span>
  );
}
