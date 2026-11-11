// The list of tickets, with sortable columns and staff selection for bulk actions.
import { useEffect, useRef } from "react";
import { Mail, Paperclip } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type {
  Role,
  SortDirection,
  TicketSortKey,
  TicketSummary,
} from "../../types";
import { ticketRef, timeAgo } from "../../lib/format";
import { SLA_TARGET_HOURS } from "../../lib/ticketMeta";
import { useCountdown } from "../../hooks/useCountdown";
import { OverdueBadge, PriorityBadge, StatusBadge } from "../ui/Badges";
import Avatar from "../ui/Avatar";
import { cn } from "../../lib/cn";
import { loadGsap } from "../../lib/gsapRuntime";

interface Props {
  tickets: TicketSummary[];
  role: Role;
  onOpen: (id: number) => void;
  activeTicketId: number | null;
  selectedIds: number[];
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  sortBy: TicketSortKey;
  sortDirection: SortDirection;
  onSort: (key: TicketSortKey) => void;
}

function SlaCountdown({ ticket }: { ticket: TicketSummary }) {
  const deadline =
    ticket.due_at ??
    new Date(
      new Date(ticket.created_at).getTime() +
        SLA_TARGET_HOURS[ticket.priority] * 60 * 60 * 1000,
    ).toISOString();
  const seconds = Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000),
  );
  const [left, setLeft] = useCountdown(seconds);

  useEffect(() => {
    setLeft(
      Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)),
    );
  }, [deadline, setLeft]);

  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return null;
  if (left <= 0 || ticket.is_overdue) return <OverdueBadge />;
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const label = hours > 0 ? `due in ${hours}h` : `due in ${minutes}m`;
  const urgent = left <= 60 * 60;
  const warning = left <= 4 * 60 * 60;

  return (
    <span
      title={`SLA deadline ${new Date(deadline).toLocaleString()}`}
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        urgent
          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          : warning
            ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      )}
    >
      {label}
    </span>
  );
}

export default function TicketList({
  tickets,
  role,
  onOpen,
  activeTicketId,
  selectedIds,
  onToggle,
  onToggleAll,
  sortBy,
  sortDirection,
  onSort,
}: Props) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root || tickets.length === 0 || reduceMotion !== false) return;

    let cancelled = false;
    let revert: (() => void) | undefined;
    void loadGsap().then(({ gsap }) => {
      if (cancelled) return;
      const context = gsap.context(() => {
        gsap.fromTo(
          root,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.58,
            ease: "power3.out",
            scrollTrigger: {
              trigger: root,
              start: "top 92%",
              once: true,
            },
          },
        );
      }, root);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduceMotion, tickets.length]);
  const sortable: Array<{ key: TicketSortKey; label: string }> = [
    { key: "title", label: "Ticket" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "sla", label: "SLA due" },
  ];

  return (
    <div ref={listRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
        {role !== "USER" && (
          <input
            type="checkbox"
            aria-label="Select all tickets on this page"
            checked={
              tickets.length > 0 &&
              tickets.every((t) => selectedIds.includes(t.id))
            }
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
        )}
        <div className="hidden flex-1 grid-cols-[minmax(0,1fr)_7rem_8rem_10rem] items-center gap-4 sm:grid">
          {sortable.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSort(key)}
              aria-label={`Sort by ${label}`}
              className={cn(
                "text-left text-xs font-semibold",
                sortBy === key ? "text-slate-900" : "text-slate-500",
              )}
            >
              {label}
              {sortBy === key && (sortDirection === "desc" ? " ↓" : " ↑")}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort tickets"
          value={sortBy}
          onChange={(event) =>
            onSort(event.target.value as TicketSortKey)
          }
          className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 sm:hidden"
        >
          {sortable.map(({ key, label }) => (
            <option key={key} value={key}>
              Sort by {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSort(sortBy)}
          aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 sm:hidden"
        >
          {sortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>
      <m.ul layout={!reduceMotion} className="divide-y divide-slate-200">
        <AnimatePresence initial={false}>
          {tickets.map((t) => (
          activeTicketId === t.id ? null : (
          <m.li
            key={t.id}
            layout={!reduceMotion}
            layoutId={`ticket-card-${t.id}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                  : { opacity: 0, y: -4, transition: { duration: 0.14 } }
            }
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
            whileHover={reduceMotion ? undefined : { scale: 1.005 }}
            whileTap={reduceMotion ? undefined : { scale: 0.995 }}
            whileFocus={reduceMotion ? undefined : { scale: 1.005 }}
            style={{ transformOrigin: "center" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
              {role !== "USER" && (
                <input
                  type="checkbox"
                  aria-label={`Select ${ticketRef(t.id)}`}
                  checked={selectedIds.includes(t.id)}
                  onChange={() => onToggle(t.id)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                />
              )}
              <a
                href={`/tickets/${ticketRef(t.id)}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onOpen(t.id);
                }}
                className="grid min-w-0 flex-1 grid-cols-1 items-center gap-2 text-left sm:grid-cols-[minmax(0,1fr)_7rem_8rem_10rem] sm:gap-4"
              >
                <div className="min-w-0">
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

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 sm:hidden">
                    Priority
                  </span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 sm:hidden">
                    Status
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 sm:hidden">
                    SLA
                  </span>
                  <SlaCountdown ticket={t} />
                  {t.assignee_name && (
                    <Avatar name={t.assignee_name} size="sm" />
                  )}
                </div>
              </a>
            </div>
          </m.li>
          )
          ))}
        </AnimatePresence>
      </m.ul>
    </div>
  );
}
