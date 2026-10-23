// The audit trail of a ticket (IT / ADMIN only). Collapsed by default to keep the screen calm.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatDateTime } from "../../lib/format";
import { PRIORITY_META, STATUS_META } from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";
import type { HistoryItem, Priority, TicketStatus } from "../../types";

/** Turns an audit row into a readable sentence. */
function describe(h: HistoryItem): string {
  const d = h.details ?? {};
  switch (h.action) {
    case "TICKET_CREATED":
      return "created the ticket";
    case "TICKET_STATUS_CHANGED":
      return `changed the status from ${STATUS_META[d.from as TicketStatus]?.label ?? d.from} to ${
        STATUS_META[d.to as TicketStatus]?.label ?? d.to
      }`;
    case "TICKET_PRIORITY_CHANGED":
      return `changed the priority from ${PRIORITY_META[d.from as Priority]?.label ?? d.from} to ${
        PRIORITY_META[d.to as Priority]?.label ?? d.to
      }`;
    case "TICKET_ASSIGNED":
      return d.to_name
        ? `assigned the ticket to ${d.to_name}`
        : "removed the assignee";
    case "TICKET_DUE_CHANGED":
      return d.to
        ? `set the due date to ${formatDateTime(d.to)}`
        : "cleared the due date";
    case "COMMENT_ADDED":
      return d.internal ? "added an internal note" : "replied";
    case "FILE_ADDED":
      return `attached ${d.name ?? "a file"}`;
    case "FILE_REMOVED":
      return `removed ${d.name ?? "a file"}`;
    default:
      return h.action.toLowerCase().replace(/_/g, " ");
  }
}

export default function HistoryTimeline({
  history,
}: {
  history: HistoryItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-label="History">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700"
      >
        <span>
          History{" "}
          <span className="font-normal text-slate-400">({history.length})</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <ol className="mt-3 animate-fade-in space-y-3 border-l border-slate-200 pl-4">
          {history.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300"
                aria-hidden
              />
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">
                  {h.actor_name ?? "System"}
                </span>{" "}
                {describe(h)}
              </p>
              <p className="text-xs text-slate-400">
                {formatDateTime(h.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
