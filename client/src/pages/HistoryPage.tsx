// The Ticket History tab (ADMIN and IT): every resolved and closed ticket of every business unit.
//  - IT: view only. No button on this page changes anything, and the server refuses changes anyway.
//  - ADMIN: can open a ticket in the full ticket window to manage it.
// Standard users never see this tab, and the server answers "not found" to them.
import { useEffect, useRef, useState } from "react";
import {
  History as HistoryIcon,
  Lock,
  Paperclip,
  Search,
  SearchX,
} from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import {
  historyApi,
  type HistoryListResponse,
  type HistoryQuery,
  type HistoryStatus,
} from "../api/history";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../lib/cn";
import { formatDateTime, ticketRef, timeAgo } from "../lib/format";
import { PRIORITY_LIST, PRIORITY_META } from "../lib/ticketMeta";
import type { Priority, UnitOption, User } from "../types";
import HistoryDetailModal from "../components/history/HistoryDetailModal";
import Avatar from "../components/ui/Avatar";
import { PriorityBadge, StatusBadge } from "../components/ui/Badges";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import FormError from "../components/ui/FormError";
import Pagination from "../components/ui/Pagination";
import Skeleton from "../components/ui/Skeleton";

const EMPTY: HistoryQuery = {
  q: "",
  status: "",
  priority: "",
  unit: "",
  from: "",
  to: "",
  page: 1,
};

const FIELD =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

interface Props {
  user: User;
  /** Increases whenever something changed elsewhere, so the list must reload. */
  version: number;
  /** Given only to ADMIN: opens the full ticket window. */
  onManage?: (id: number) => void;
}

export default function HistoryPage({ user, version, onManage }: Props) {
  const isAdmin = user.role === "ADMIN";

  const [query, setQuery] = useState<HistoryQuery>(EMPTY);
  const [text, setText] = useState("");
  const debounced = useDebounce(text, 300);
  const [data, setData] = useState<HistoryListResponse | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const requestId = useRef(0);

  // The business units for the filter (every unit, because the history spans all of them)
  useEffect(() => {
    authApi
      .units()
      .then((r) => setUnits(r.units))
      .catch(() => undefined);
  }, []);

  // The search runs 300 ms after you stop typing
  useEffect(() => {
    setQuery((q) => (q.q === debounced ? q : { ...q, q: debounced, page: 1 }));
  }, [debounced]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    historyApi
      .list(query)
      .then((r) => {
        if (id === requestId.current) setData(r);
      })
      .catch((err) => {
        if (id === requestId.current)
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load the history.",
          );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query, version]);

  // If the current page no longer exists (a ticket was reopened or deleted), go back to page 1
  useEffect(() => {
    if (data && data.tickets.length === 0 && data.total > 0 && query.page > 1) {
      setQuery((q) => ({ ...q, page: 1 }));
    }
  }, [data, query.page]);

  function change(patch: Partial<HistoryQuery>) {
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  }

  function clearFilters() {
    setText("");
    setQuery(EMPTY);
  }

  const filtersActive = !!(
    query.q ||
    query.status ||
    query.priority ||
    query.unit ||
    query.from ||
    query.to
  );
  const firstLoad = loading && !data;
  const all = data ? data.counts.RESOLVED + data.counts.CLOSED : 0;

  const chips: Array<{
    key: "" | HistoryStatus;
    label: string;
    count: number | null;
  }> = [
    { key: "", label: "All", count: data ? all : null },
    {
      key: "RESOLVED",
      label: "Resolved",
      count: data ? data.counts.RESOLVED : null,
    },
    { key: "CLOSED", label: "Closed", count: data ? data.counts.CLOSED : null },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Ticket history
        </h2>
        <p className="text-sm text-slate-500">
          Resolved and closed tickets from every business unit.{" "}
          {isAdmin ? (
            "Open a ticket to read it, or to manage it."
          ) : (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden /> View only.
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={100}
            placeholder="Search by number (HD-12), title, text or requester email"
            aria-label="Search the history"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div
            className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5"
            role="group"
            aria-label="Filter by status"
          >
            {chips.map((c) => {
              const active = query.status === c.key;
              return (
                <button
                  key={c.key || "all"}
                  type="button"
                  onClick={() => change({ status: c.key })}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand text-onbrand shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {c.label}
                  {c.count !== null && (
                    <span
                      className={cn(
                        "text-xs",
                        active ? "opacity-90" : "text-slate-400",
                      )}
                    >
                      {c.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by business unit"
              className={FIELD}
              value={query.unit}
              onChange={(e) => change({ unit: e.target.value })}
            >
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by priority"
              className={FIELD}
              value={query.priority}
              onChange={(e) =>
                change({ priority: e.target.value as "" | Priority })
              }
            >
              <option value="">All priorities</option>
              {PRIORITY_LIST.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-500">
              From
              <input
                type="date"
                className={FIELD}
                value={query.from}
                max={query.to || undefined}
                onChange={(e) => change({ from: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-500">
              To
              <input
                type="date"
                className={FIELD}
                value={query.to}
                min={query.from || undefined}
                onChange={(e) => change({ to: e.target.value })}
              />
            </label>
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <FormError message={error} />

      {firstLoad ? (
        <div
          className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-busy="true"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : data && data.tickets.length > 0 ? (
        <>
          <p className="text-sm text-slate-500">
            {data.total} ticket{data.total === 1 ? "" : "s"}
          </p>
          <ul
            className={cn(
              "divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity",
              loading && "opacity-60",
            )}
          >
            {data.tickets.map((t) => (
              <li key={t.id} className="animate-fade-in">
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                >
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
                      <span className="font-mono" title={t.unit_name}>
                        {t.unit_code}
                      </span>
                      <span className="truncate">
                        {t.requester_name}
                        {t.requester_department
                          ? ` · ${t.requester_department}`
                          : ""}
                      </span>
                      <span title={formatDateTime(t.finished_at)}>
                        {t.status === "CLOSED" ? "Closed" : "Resolved"}{" "}
                        {timeAgo(t.finished_at)}
                      </span>
                      {t.file_count > 0 && (
                        <span
                          className="inline-flex items-center gap-1"
                          title={`${t.file_count} attachment(s)`}
                        >
                          <Paperclip className="h-3 w-3" aria-hidden />
                          {t.file_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    {t.assignee_name && (
                      <Avatar name={t.assignee_name} size="sm" />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(page) => change({ page })}
          />
        </>
      ) : data && !error ? (
        filtersActive ? (
          <EmptyState
            icon={SearchX}
            title="No tickets match your filters"
            description="Try a different search, unit or date range."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={HistoryIcon}
            title="The history is empty"
            description="Tickets appear here once they are resolved or closed."
          />
        )
      ) : null}

      {openId !== null && (
        <ErrorBoundary onClose={() => setOpenId(null)}>
          <HistoryDetailModal
            key={openId}
            ticketId={openId}
            user={user}
            onClose={() => setOpenId(null)}
            onManage={isAdmin ? onManage : undefined}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
