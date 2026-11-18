// The Dashboard tab (IT / ADMIN). Reloads whenever `version` changes (a ticket was changed elsewhere).
import { useEffect, useRef, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { BookOpen, Laptop, Network, Printer, Search, ShieldCheck, Ticket as TicketIcon, Workflow } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { dashboardApi, type DashboardData } from "../api/dashboard";
import { kbApi, type ArticleSuggestion } from "../api/kb";
import { ticketsApi } from "../api/tickets";
import {
  PRIORITY_LIST,
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
} from "../lib/ticketMeta";
import type {
  DashboardFilters,
  TicketQuery,
  TicketStatus,
  TicketSummary,
  UnitOption,
  User,
} from "../types";
import { ticketRef, timeAgo } from "../lib/format";
import { StatusBadge } from "../components/ui/Badges";
import BreakdownBars, {
  type BarItem,
} from "../components/dashboard/BreakdownBars";
import KpiCards from "../components/dashboard/KpiCards";
import OverdueBanner from "../components/dashboard/OverdueBanner";
import TrendChart from "../components/dashboard/TrendChart";
import EmptyState from "../components/ui/EmptyState";
import FormError from "../components/ui/FormError";
import { DashboardSkeleton } from "../components/ui/Skeleton";
import Button from "../components/ui/Button";
import { loadGsap } from "../lib/gsapRuntime";
import { useDebounce } from "../hooks/useDebounce";
import { ARTICLE_CATEGORY_META } from "../lib/kbMeta";

interface Props {
  user: User;
  version: number;
  onOpen: (id: number) => void;
  onShowTickets: (filters: Partial<TicketQuery>) => void;
  onSearchKnowledgeBase: (keywords: string) => void;
  onCreate: (draft?: { title?: string; description?: string } | null) => void;
}

// Bar colors for each priority (only the colors dark mode knows about)
const PRIORITY_BAR: Record<string, string> = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-slate-400",
  HIGH: "bg-indigo-500",
  URGENT: "bg-rose-500",
};

const EMPTY_FILTERS: DashboardFilters = {
  unit: "",
  status: "",
  priority: "",
  createdWithin: "",
};

const SELECT_CLASS =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

function KnowledgeBaseQuickSearch({
  search,
  onViewResults,
}: {
  search: string;
  onViewResults: () => void;
}) {
  const query = useDebounce(search.trim(), 300);
  const [articles, setArticles] = useState<ArticleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (query.length < 3) {
      setArticles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    kbApi
      .suggest(query)
      .then((result) => {
        if (id === requestId.current) setArticles(result.articles);
      })
      .catch(() => {
        if (id === requestId.current) setArticles([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query]);

  if (search.trim().length < 3) return null;

  return (
    <div
      className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
        <BookOpen className="h-3.5 w-3.5 text-brand" aria-hidden />
        Knowledge Base matches
      </div>
      {loading ? (
        <p className="px-3 py-3 text-sm text-slate-500">Searching articles…</p>
      ) : articles.length ? (
        <ul className="max-h-72 overflow-y-auto py-1">
          {articles.map((article) => (
            <li key={article.id}>
              <button
                type="button"
                onClick={onViewResults}
                className="w-full px-3 py-2.5 text-left transition hover:bg-slate-50"
              >
                <span className="block truncate text-sm font-medium text-slate-900">
                  {article.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {ARTICLE_CATEGORY_META[article.category]} · {article.excerpt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-3 text-sm text-slate-500">No matching articles yet.</p>
      )}
      <button
        type="button"
        onClick={onViewResults}
        className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-brand transition hover:bg-slate-50"
      >
        View all results for “{search.trim()}”
      </button>
    </div>
  );
}

function RequesterPortal({ user, version, onOpen, onShowTickets, onSearchKnowledgeBase, onCreate }: {
  user: User; version: number; onOpen: (id: number) => void;
  onShowTickets: (filters: Partial<TicketQuery>) => void;
  onSearchKnowledgeBase: (keywords: string) => void;
  onCreate: (draft?: { title?: string; description?: string } | null) => void;
}) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    ticketsApi.list({ q: "", status: "", priority: "", unit: "", assignee: "", page: 1, activeOnly: true, sortBy: "created_at", sortDirection: "desc" })
      .then((result) => { if (!cancelled) setTickets(result.tickets.slice(0, 4)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [version]);

  const categories = [
    { label: "Hardware & laptop", detail: "Device, monitor or accessories", icon: Laptop, draft: "I need help with my laptop or hardware." },
    { label: "Network & Wi-Fi", detail: "Connection, VPN or network access", icon: Network, draft: "I need help connecting to the network or Wi-Fi." },
    { label: "Software & access", detail: "Applications, accounts or permissions", icon: ShieldCheck, draft: "I need help with software access or permissions." },
    { label: "Printer & office", detail: "Printing, scanners and meeting rooms", icon: Printer, draft: "I need help with office equipment or printing." },
  ];
  const step = (status: TicketStatus) => status === "OPEN" ? 1 : status === "IN_PROGRESS" ? 2 : 3;
  return <div className="space-y-6">
    <section className="relative z-10 overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 bg-[linear-gradient(115deg,var(--surface)_0%,color-mix(in_srgb,var(--brand)_7%,var(--surface))_100%)] px-6 py-7 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">Service portal</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How can we help, {user.name.split(" ")[0]}?</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600">Find help quickly, report an issue, or follow the progress of your requests.</p>
          <form className="relative mt-5 max-w-xl" onSubmit={(event) => { event.preventDefault(); onSearchKnowledgeBase(search); }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search the knowledge base" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="Search common issues and guides" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            <KnowledgeBaseQuickSearch
              search={search}
              onViewResults={() => onSearchKnowledgeBase(search)}
            />
          </form>
        </div>
        <Button onClick={() => onCreate()} icon={<TicketIcon className="h-4 w-4" />}>Submit new ticket</Button>
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Active tickets</h3><p className="text-xs text-slate-500">Track every request from submission to resolution.</p></div><button onClick={() => onShowTickets({ activeOnly: true })} className="text-sm font-medium text-brand hover:underline">View all</button></div>
      {tickets.length ? <div className="grid gap-3 lg:grid-cols-2">{tickets.map((ticket) => <button key={ticket.id} onClick={() => onOpen(ticket.id)} className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand/40 hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-slate-500">{ticketRef(ticket.id)}</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{ticket.title}</p></div><StatusBadge status={ticket.status} /></div><div className="mt-4 flex items-center gap-1.5">{[1,2,3].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step(ticket.status) ? "bg-brand" : "bg-slate-200"}`} />)}</div><div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>{ticket.status === "OPEN" ? "Submitted" : ticket.status === "IN_PROGRESS" ? "In progress" : ticket.status === "RESOLVED" ? "Awaiting your confirmation" : "Closed"}</span><span className="font-mono">Updated {timeAgo(ticket.updated_at)}</span></div></button>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">You have no active tickets. <button onClick={() => onCreate()} className="font-medium text-brand hover:underline">Create one now.</button></div>}
    </section>
    <section><div className="mb-4"><h3 className="font-semibold text-slate-900">Quick issue categories</h3><p className="text-sm text-slate-500">Choose a category to start with a focused request.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{categories.map(({ label, detail, icon: Icon, draft }) => <button key={label} onClick={() => onCreate({ title: label, description: draft })} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></span><p className="mt-5 text-sm font-semibold text-slate-900">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></button>)}</div></section>
  </div>;
}

export default function DashboardPage({
  user,
  version,
  onOpen,
  onShowTickets,
  onSearchKnowledgeBase,
  onCreate,
}: Props) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitError, setUnitError] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const root = dashboardRef.current;
    if (!root || reduceMotion !== false) return;

    let cancelled = false;
    let revert: (() => void) | undefined;
    void loadGsap().then(({ gsap }) => {
      if (cancelled) return;
      const context = gsap.context(() => {
        root.querySelectorAll<HTMLElement>(".dashboard-entrance").forEach((item) => {
          const directChildren = Array.from(item.children);
          const staggerItems = directChildren.filter((child) =>
            child.classList.contains("dashboard-stagger-item"),
          );
          const targets = item.dataset.stagger
            ? staggerItems.length > 0
              ? staggerItems
              : directChildren
            : [item];
          gsap.fromTo(
            targets,
            { autoAlpha: 0, y: 18 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.62,
              stagger: item.dataset.stagger ? 0.075 : 0,
              ease: "power3.out",
              scrollTrigger: {
                trigger: item,
                start: "top 92%",
                once: true,
              },
            },
          );
        });
      }, root);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [data, reduceMotion]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardApi
      .stats(filters)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError("");
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load the dashboard.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version, filters]);

  useEffect(() => {
    if (user.role !== "ADMIN") return;
    let cancelled = false;
    authApi
      .units()
      .then((r) => {
        if (!cancelled) {
          setUnits(r.units);
          setUnitError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setUnitError(
            err instanceof ApiError
              ? err.message
              : "Could not load business units.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.role]);

  const hasFilters = Object.values(filters).some(Boolean);

  if (user.role === "USER") {
    return <RequesterPortal user={user} version={version} onOpen={onOpen} onShowTickets={onShowTickets} onSearchKnowledgeBase={onSearchKnowledgeBase} onCreate={onCreate} />;
  }
  const currentTicketFilters: Partial<TicketQuery> = {
    ...(user.role === "ADMIN" ? { unit: filters.unit } : {}),
    status: filters.status,
    priority: filters.priority,
    createdWithin: filters.createdWithin,
  };
  const filterBar = (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-slate-700">Filter dashboard:</span>
        {user.role === "ADMIN" && (
          <select
            aria-label="Filter dashboard by business unit"
            value={filters.unit}
            onChange={(e) =>
              setFilters((current) => ({ ...current, unit: e.target.value }))
            }
            className={SELECT_CLASS}
          >
            <option value="">All business units</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {unit.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter dashboard by ticket status"
          value={filters.status}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              status: e.target.value as DashboardFilters["status"],
            }))
          }
          className={SELECT_CLASS}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter dashboard by priority"
          value={filters.priority}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              priority: e.target.value as DashboardFilters["priority"],
            }))
          }
          className={SELECT_CLASS}
        >
          <option value="">All priorities</option>
          {PRIORITY_LIST.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter dashboard by created date"
          value={filters.createdWithin}
          onChange={(e) =>
            setFilters((current) => ({
              ...current,
              createdWithin: e.target.value as DashboardFilters["createdWithin"],
            }))
          }
          className={SELECT_CLASS}
        >
          <option value="">All time</option>
          <option value="7">Created in the last 7 days</option>
          <option value="30">Created in the last 30 days</option>
          <option value="90">Created in the last 90 days</option>
        </select>
        {hasFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        )}
      </div>
      {unitError && <FormError message={unitError} />}
    </div>
  );

  if (error && !data) {
    return (
      <div className="space-y-4">
        {filterBar}
        <FormError message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <m.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.18 }}
        aria-busy="true"
        aria-label="Loading dashboard"
      >
        <DashboardSkeleton />
      </m.div>
    );
  }

  if (data.kpis.total === 0) {
    return (
      <div
        className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}
        aria-busy={loading}
      >
        {filterBar}
        {error && <FormError message={error} />}
        <EmptyState
          icon={TicketIcon}
          title={hasFilters ? "No tickets match these filters" : "No tickets yet"}
          description={
            hasFilters
              ? "Try changing or clearing your dashboard filters."
              : "Statistics will appear here as soon as the first ticket is created."
          }
        />
      </div>
    );
  }

  const { kpis } = data;
  const trend = data.trend ?? []; // an old server without the trend simply shows no chart

  const statusItems: BarItem[] = [
    {
      label: STATUS_META.OPEN.label,
      value: kpis.open,
      bar: "bg-emerald-500",
      onClick: () => onShowTickets({ ...currentTicketFilters, status: "OPEN" }),
    },
    {
      label: STATUS_META.IN_PROGRESS.label,
      value: kpis.in_progress,
      bar: "bg-amber-500",
      onClick: () =>
        onShowTickets({ ...currentTicketFilters, status: "IN_PROGRESS" }),
    },
    {
      label: STATUS_META.RESOLVED.label,
      value: kpis.resolved,
      bar: "bg-emerald-300",
      onClick: () => onShowTickets({ ...currentTicketFilters, status: "RESOLVED" }),
    },
    {
      label: STATUS_META.CLOSED.label,
      value: kpis.closed,
      bar: "bg-slate-300",
      onClick: () => onShowTickets({ ...currentTicketFilters, status: "CLOSED" }),
    },
  ];

  const priorityItems: BarItem[] = PRIORITY_LIST.map((p) => ({
    label: PRIORITY_META[p].label,
    value: data.byPriority[p] ?? 0,
    bar: PRIORITY_BAR[p],
    onClick: () =>
      onShowTickets({
        ...currentTicketFilters,
        priority: p,
        ...(filters.status ? {} : { activeOnly: true }),
      }),
  }));

  const unitItems: BarItem[] = data.byUnit.map((u) => ({
    label: u.code,
    value: u.n,
    bar: "bg-brand",
    title: u.name,
    onClick: () =>
      onShowTickets({
        ...currentTicketFilters,
        unit: String(u.id),
        ...(filters.status ? {} : { activeOnly: true }),
      }),
  }));
  const breakdownSubtitle = filters.status
    ? `${STATUS_META[filters.status].label} tickets`
    : "Open and in progress";

  function showKpi(key: keyof typeof kpis) {
    const filters: Partial<TicketQuery> = {};
    const statusByKpi: Partial<Record<typeof key, TicketStatus>> = {
      open: "OPEN",
      in_progress: "IN_PROGRESS",
      resolved: "RESOLVED",
    };
    const status = statusByKpi[key];
    if (status) filters.status = status;
    if (key === "urgent" || key === "sla") {
      filters.activeOnly = true;
    }
    if (key === "urgent") {
      filters.priority = "URGENT";
    }
    onShowTickets({ ...currentTicketFilters, ...filters });
  }

  return (
    <div
      ref={dashboardRef}
      className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}
      aria-busy={loading}
    >
      <div className="dashboard-entrance">{filterBar}</div>
      {error && <FormError message={error} />}
      <div className="dashboard-entrance">
      <OverdueBanner
        count={kpis.overdue}
        tickets={data.overdueTickets}
        onOpen={onOpen}
        onViewAll={() =>
          onShowTickets({ ...currentTicketFilters, overdueOnly: true })
        }
      />
      </div>
      <div className="dashboard-entrance" data-stagger>
        <KpiCards kpis={kpis} onSelect={showKpi} />
      </div>

      {trend.length > 1 && (
        <div className="dashboard-entrance">
          <TrendChart points={trend} />
        </div>
      )}

      <div className="dashboard-entrance grid gap-4 lg:grid-cols-2" data-stagger>
        <BreakdownBars
          title="Tickets by status"
          subtitle="All tickets"
          items={statusItems}
        />
        <BreakdownBars
          title={
            filters.status
              ? "Tickets by priority"
              : "Active tickets by priority"
          }
          subtitle={breakdownSubtitle}
          items={priorityItems}
        />
      </div>

      {user.role === "ADMIN" && unitItems.length > 0 && (
        <div className="dashboard-entrance">
        <BreakdownBars
          title={
            filters.status
              ? "Tickets by business unit"
              : "Active tickets by business unit"
          }
          subtitle={breakdownSubtitle}
          items={unitItems}
        />
        </div>
      )}
    </div>
  );
}
