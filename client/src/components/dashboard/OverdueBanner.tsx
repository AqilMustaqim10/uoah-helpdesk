// A red notice listing the oldest overdue tickets. Shows nothing when there are none.
import { AlarmClock } from "lucide-react";
import type { TicketSummary } from "../../types";
import { ticketRef } from "../../lib/format";
import { PriorityBadge } from "../ui/Badges";

interface Props {
  count: number;
  tickets: TicketSummary[];
  onOpen: (id: number) => void;
}

export default function OverdueBanner({ count, tickets, onOpen }: Props) {
  if (count === 0) return null;

  return (
    <div
      role="alert"
      className="animate-fade-in rounded-2xl border border-rose-200 bg-rose-50 p-4"
    >
      <div className="flex items-center gap-2 text-rose-700">
        <AlarmClock className="h-5 w-5 shrink-0" aria-hidden />
        <p className="text-sm font-semibold">
          {count} ticket{count === 1 ? " is" : "s are"} overdue
        </p>
      </div>

      <ul className="mt-3 space-y-1">
        {tickets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-rose-100"
            >
              <span className="shrink-0 font-mono text-xs font-medium text-rose-700">
                {ticketRef(t.id)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                {t.title}
              </span>
              <PriorityBadge priority={t.priority} />
            </button>
          </li>
        ))}
      </ul>

      {count > tickets.length && (
        <p className="mt-2 px-2 text-xs text-rose-700">
          and {count - tickets.length} more
        </p>
      )}
    </div>
  );
}
