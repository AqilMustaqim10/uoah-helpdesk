// The Cmd/Ctrl + K "spotlight": one box to jump to a page, run a quick action, or find a ticket.
// Built on cmdk (keyboard navigation and accessibility), animated with Framer Motion.
//  - Navigate: the tabs this role may see
//  - Quick actions: create a ticket, ready-made ticket filters, dark mode, sign out
//  - Tickets: recent ones when the box is empty, otherwise the server's search (same `q` as the Tickets
//    page, so "TKT-12", "12" or words from the title all work)
// The server still decides what each role may see; this only offers shortcuts.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { AnimatePresence, m } from "framer-motion";
import {
  AlarmClock,
  CornerDownLeft,
  Flame,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { ticketsApi } from "../../api/tickets";
import type { TabKey, TicketQuery, TicketSummary, User } from "../../types";
import type { TabDef } from "../../lib/nav";
import { ticketRef } from "../../lib/format";
import { cn } from "../../lib/cn";
import { MOD_KEY } from "../../lib/platform";
import { EXIT_FAST, SPRING_SURFACE } from "../../lib/motion";
import { useDebounce } from "../../hooks/useDebounce";
import { useTheme } from "../../hooks/useTheme";
import { StatusBadge } from "../ui/Badges";
import Skeleton from "../ui/Skeleton";

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  tabs: TabDef[];
  onNavigate: (key: TabKey) => void;
  onOpenTicket: (id: number) => void;
  onCreateTicket: () => void;
  onShowTickets: (filters: Partial<TicketQuery>) => void;
  onLogout: () => void;
}

interface Action {
  id: string;
  label: string;
  keywords: string;
  icon: LucideIcon;
  run: () => void;
}

const EMPTY_QUERY: TicketQuery = {
  q: "",
  status: "",
  priority: "",
  unit: "",
  assignee: "",
  page: 1,
};

const GROUP =
  "px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-500 dark:[&_[cmdk-group-heading]]:text-slate-400";

const ITEM =
  "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-700 outline-none transition-colors data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900 dark:text-slate-300 dark:data-[selected=true]:bg-slate-800 dark:data-[selected=true]:text-slate-100";

function Row({
  icon: Icon,
  children,
  hint,
}: {
  icon: LucideIcon;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint}
    </>
  );
}

export default function CommandPalette({
  open,
  onClose,
  user,
  tabs,
  onNavigate,
  onOpenTicket,
  onCreateTicket,
  onShowTickets,
  onLogout,
}: Props) {
  const { dark, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const staff = user.role !== "USER";

  // Fresh box every time it opens; give keyboard focus back to the page when it closes
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery("");
    return () => previous?.focus?.();
  }, [open]);

  // Tickets: recent ones for an empty box, search results otherwise
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    ticketsApi
      .list({ ...EMPTY_QUERY, q: debounced })
      .then((r) => {
        if (id === requestId.current) setTickets(r.tickets.slice(0, 6));
      })
      .catch(() => {
        if (id === requestId.current) setTickets([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [open, debounced]);

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [
      {
        id: "create",
        label: "Create ticket",
        keywords: "new report problem issue add",
        icon: Plus,
        run: onCreateTicket,
      },
    ];
    if (staff) {
      list.push(
        {
          id: "overdue",
          label: "Show overdue tickets",
          keywords: "sla late breached",
          icon: AlarmClock,
          run: () => onShowTickets({ overdueOnly: true }),
        },
        {
          id: "urgent",
          label: "Show urgent tickets",
          keywords: "priority critical active",
          icon: Flame,
          run: () => onShowTickets({ priority: "URGENT", activeOnly: true }),
        },
        {
          id: "mine",
          label: "Show tickets assigned to me",
          keywords: "my assigned",
          icon: UserCheck,
          run: () => onShowTickets({ assignee: "me", activeOnly: true }),
        },
        {
          id: "unassigned",
          label: "Show unassigned tickets",
          keywords: "nobody triage",
          icon: UserX,
          run: () => onShowTickets({ assignee: "unassigned", activeOnly: true }),
        },
      );
    } else {
      list.push({
        id: "active",
        label: "Show my active tickets",
        keywords: "open in progress mine",
        icon: UserCheck,
        run: () => onShowTickets({ activeOnly: true }),
      });
    }
    list.push(
      {
        id: "theme",
        label: dark ? "Switch to light mode" : "Switch to dark mode",
        keywords: "theme appearance night day",
        icon: dark ? Sun : Moon,
        run: toggle,
      },
      {
        id: "logout",
        label: "Sign out",
        keywords: "log out exit",
        icon: LogOut,
        run: onLogout,
      },
    );
    return list;
  }, [staff, dark, toggle, onCreateTicket, onShowTickets, onLogout]);

  // The tickets are already filtered by the server; pages and actions are filtered here
  const needle = query.trim().toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
  const shownTabs = tabs.filter((t) => matches(`${t.label} go to open page`));
  const shownActions = actions.filter((a) => matches(`${a.label} ${a.keywords}`));
  const searching = loading && tickets.length === 0;

  /** Close the palette first, then do the thing. */
  const choose = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_FAST }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <m.div
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: EXIT_FAST }}
            transition={SPRING_SURFACE}
            className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <Command
              shouldFilter={false}
              loop
              label="Command palette"
              className="flex max-h-[min(30rem,70vh)] flex-col"
            >
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
                <Search
                  className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden
                />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search tickets, jump to a page, run an action…"
                  style={{ outline: "none" }}
                  className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:block">
                  esc
                </kbd>
              </div>

              <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                {shownTabs.length > 0 && (
                  <Command.Group heading="Navigate" className={GROUP}>
                    {shownTabs.map((t) => (
                      <Command.Item
                        key={t.key}
                        value={`nav:${t.key}`}
                        onSelect={choose(() => onNavigate(t.key))}
                        className={ITEM}
                      >
                        <Row icon={t.icon}>Go to {t.label}</Row>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {shownActions.length > 0 && (
                  <Command.Group heading="Quick actions" className={GROUP}>
                    {shownActions.map((a) => (
                      <Command.Item
                        key={a.id}
                        value={`act:${a.id}`}
                        onSelect={choose(a.run)}
                        className={ITEM}
                      >
                        <Row icon={a.icon}>{a.label}</Row>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group
                  heading={needle ? "Tickets" : "Recent tickets"}
                  className={GROUP}
                >
                  {searching ? (
                    // placeholder rows shaped like the results
                    <div aria-busy="true" aria-label="Searching tickets">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-2 py-2">
                          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                          <Skeleton className="h-3.5 w-12" />
                          <Skeleton className="h-3.5 flex-1" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    tickets.map((t) => (
                      <Command.Item
                        key={t.id}
                        value={`ticket:${t.id}`}
                        onSelect={choose(() => onOpenTicket(t.id))}
                        className={ITEM}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white font-mono text-[10px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                          #
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          {ticketRef(t.id)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </Command.Item>
                    ))
                  )}
                </Command.Group>

                {!searching &&
                  shownTabs.length + shownActions.length + tickets.length === 0 && (
                    <Command.Empty className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nothing matches “{query.trim()}”.
                    </Command.Empty>
                  )}
              </Command.List>

              <div className="flex items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <kbd className="font-mono">↑↓</kbd> move
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" aria-hidden /> select
                </span>
                <span className={cn("ml-auto font-mono")}>{MOD_KEY} K</span>
              </div>
            </Command>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
