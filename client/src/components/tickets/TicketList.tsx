// The ticket table.
//  - large screens: a header row (ID, Subject, ... ) and one row per ticket, all on the same column grid
//  - small screens: each ticket is a compact stacked card (a table would be too wide)
// Clicking a row (or pressing Enter/Space on it) opens the ticket drawer. The row's background layer
// carries a shared layoutId, so the drawer visibly grows out of the row you clicked (see Drawer.tsx).
// Ticket numbers and times are monospaced so they line up.
import type { KeyboardEvent } from "react";
import { Mail, Paperclip } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { Role, TicketSummary } from "../../types";
import { formatDateTime, ticketRef, timeAgo } from "../../lib/format";
import { ticketGridFor } from "../../lib/ticketGrid";
import { cn } from "../../lib/cn";
import { ticketSurfaceId } from "../../lib/motion";
import { OverdueBadge, PriorityBadge, StatusBadge } from "../ui/Badges";
import { CARD_SURFACE } from "../ui/Bento";
import { MORPH_ATTR } from "../ui/Drawer";
import Avatar from "../ui/Avatar";

interface Props {
  tickets: TicketSummary[];
  role: Role;
  onOpen: (id: number) => void;
}

const MONO_META =
  "font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400";

/** "3 attachments" and "from an email" markers, shared by both layouts. */
function Markers({ t }: { t: TicketSummary }) {
  return (
    <>
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
    </>
  );
}

export default function TicketList({ tickets, role, onOpen }: Props) {
  const reduceMotion = useReducedMotion();
  const showUnit = role === "ADMIN";
  const grid = ticketGridFor(showUnit);
  const headers = [
    "ID",
    "Subject",
    ...(showUnit ? ["Unit"] : []),
    "Priority",
    "Status",
    "Assignee",
    "Created",
  ];

  function onKey(e: KeyboardEvent<HTMLElement>, id: number) {
    if (e.target !== e.currentTarget) return; // ignore keys pressed on something inside the row
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(id);
    }
  }

  return (
    <div
      role="table"
      aria-label="Tickets"
      className={cn("overflow-hidden shadow-sm", CARD_SURFACE)}
    >
      {/* ---------- header (large screens) ---------- */}
      <div
        role="row"
        className={cn(
          "hidden items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40 lg:grid",
          grid,
        )}
      >
        {headers.map((h) => (
          <div
            key={h}
            role="columnheader"
            data-reveal=""
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            {h}
          </div>
        ))}
      </div>

      {/* ---------- rows ---------- */}
      <m.div
        role="rowgroup"
        layout={!reduceMotion}
        className="divide-y divide-slate-200 dark:divide-slate-800"
      >
        <AnimatePresence initial={false}>
          {tickets.map((t) => (
            <m.div
              key={t.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, height: 0, transition: { duration: 0.14 } }
              }
              transition={{
                duration: reduceMotion ? 0 : 0.16,
                ease: "easeOut",
              }}
              className="overflow-hidden"
            >
              <div
                role="row"
                tabIndex={0}
                aria-label={`${ticketRef(t.id)} ${t.title}`}
                onClick={() => onOpen(t.id)}
                onKeyDown={(e) => onKey(e, t.id)}
                className="group relative block cursor-pointer px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                {/* Background layer: the part of the row that morphs into the drawer */}
                <m.span
                  aria-hidden
                  layoutId={ticketSurfaceId(t.id)}
                  {...{ [MORPH_ATTR]: ticketSurfaceId(t.id) }}
                  style={{
                    borderRadius: 0,
                  }}
                  className="absolute inset-0 bg-white transition-colors group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60"
                />
                {/* hover accent bar */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                />

                {/* ----- small screens: stacked ----- */}
                <div className="relative flex flex-col gap-2 lg:hidden">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn("shrink-0 font-medium", MONO_META)}
                      >
                        {ticketRef(t.id)}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {t.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{t.requester_name}</span>
                      {showUnit && <span className="font-mono">{t.unit_code}</span>}
                      <span className="font-mono tabular-nums">
                        {timeAgo(t.created_at)}
                      </span>
                      <Markers t={t} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.is_overdue && <OverdueBadge />}
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    {t.assignee_name && (
                      <Avatar name={t.assignee_name} size="sm" />
                    )}
                  </div>
                </div>

                {/* ----- large screens: table cells ----- */}
                <div
                  className={cn(
                    "relative hidden items-center gap-4 lg:grid",
                    grid,
                  )}
                >
                  <span
                    role="cell"
                    className={cn("truncate font-medium", MONO_META)}
                  >
                    {ticketRef(t.id)}
                  </span>
                  <div role="cell" className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{t.requester_name}</span>
                      <Markers t={t} />
                    </div>
                  </div>
                  {showUnit && (
                    <span role="cell" className={cn("truncate", MONO_META)}>
                      {t.unit_code}
                    </span>
                  )}
                  <div
                    role="cell"
                    className="flex flex-col items-start gap-1"
                  >
                    <PriorityBadge priority={t.priority} />
                    {t.is_overdue && <OverdueBadge />}
                  </div>
                  <div role="cell">
                    <StatusBadge status={t.status} />
                  </div>
                  <div role="cell">
                    {t.assignee_name ? (
                      <Avatar name={t.assignee_name} size="sm" />
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </div>
                  <span
                    role="cell"
                    className={cn("truncate", MONO_META)}
                    title={formatDateTime(t.created_at)}
                  >
                    {timeAgo(t.created_at)}
                  </span>
                </div>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </m.div>
    </div>
  );
}
