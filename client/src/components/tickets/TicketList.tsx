// The list of tickets. Each row is one button that opens the ticket.
import { Mail, Paperclip } from "lucide-react";
import type { Role, TicketSummary } from "../../types";
import { ticketRef, timeAgo } from "../../lib/format";
import { OverdueBadge, PriorityBadge, StatusBadge } from "../ui/Badges";
import Avatar from "../ui/Avatar";

interface Props {
  tickets: TicketSummary[];
  role: Role;
  onOpen: (id: number) => void;
}

export default function TicketList({ tickets, role, onOpen }: Props) {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {tickets.map((t) => (
        <li key={t.id} className="animate-fade-in">
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
          >
            {/* Left: id, title and small details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-xs font-medium text-slate-500">
                  {ticketRef(t.id)}
                </span>
                <span className="truncate text-sm font-medium text-slate-900">
                  {t.title}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="truncate">{t.requester_name}</span>
                {role === "ADMIN" && (
                  <span className="font-mono">{t.unit_code}</span>
                )}
                <span>{timeAgo(t.created_at)}</span>
                {t.file_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1"
                    title={`${t.file_count} attachment(s)`}
                  >
                    <Paperclip className="h-3 w-3" aria-hidden />
                    {t.file_count}
                  </span>
                )}
                {t.source === "EMAIL" && (
                  <span
                    className="inline-flex items-center gap-1"
                    title="Created from an email"
                  >
                    <Mail className="h-3 w-3" aria-hidden />
                    Email
                  </span>
                )}
              </div>
            </div>

            {/* Right: badges and assignee */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {t.is_overdue && <OverdueBadge />}
              <PriorityBadge priority={t.priority} />
              <StatusBadge status={t.status} />
              {t.assignee_name && <Avatar name={t.assignee_name} size="sm" />}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
