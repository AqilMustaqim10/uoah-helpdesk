// The audit log (ADMIN only), grouped by ticket. Filters match ticket history; 50 tickets per page.
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ScrollText, SearchX } from "lucide-react";
import {
  auditApi,
  type AuditListResponse,
  type AuditQuery,
  type AuditTicketSummary,
} from "../../api/audit";
import { ApiError } from "../../api/client";
import { useDebounce } from "../../hooks/useDebounce";
import { humanizeAction } from "../../lib/auditText";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import FormError from "../ui/FormError";
import Pagination from "../ui/Pagination";
import Skeleton from "../ui/Skeleton";
import AuditTicketDetailModal from "./AuditTicketDetailModal";

const EMPTY: AuditQuery = {
  actor: "",
  businessUnit: "",
  action: "",
  entity: "",
  ticket: "",
  from: "",
  to: "",
  page: 1,
};
const ENTITIES = [
  "ticket",
  "comment",
  "file",
  "user",
  "unit",
  "article",
  "department",
  "export",
];
const BUSINESS_UNITS = [
  { code: "CCEC", label: "CCEC" },
  { code: "FNB", label: "FNB" },
  { code: "HOTEL", label: "Hotel" },
  { code: "KLBS", label: "KLBS" },
  { code: "KLW", label: "KLW" },
  { code: "HQ", label: "HQ" },
];
const TICKET_RE = /^(hd-?)?\d{1,15}$/i;

const FIELD =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

export default function AuditLogViewer() {
  const [query, setQuery] = useState<AuditQuery>(EMPTY);
  const [actorText, setActorText] = useState("");
  const [ticketText, setTicketText] = useState("");
  const dActor = useDebounce(actorText, 300);
  const dTicket = useDebounce(ticketText.trim(), 300);
  const ticketInvalid = dTicket !== "" && !TICKET_RE.test(dTicket);

  const [data, setData] = useState<AuditListResponse | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTicket, setSelectedTicket] =
    useState<AuditTicketSummary | null>(null);
  const requestId = useRef(0);

  // The action dropdown lists every kind of action that exists
  useEffect(() => {
    auditApi
      .actions()
      .then((r) => setActions(r.actions))
      .catch(() => undefined);
  }, []);

  // The two text boxes apply 300 ms after you stop typing (a malformed ticket number is not sent)
  useEffect(() => {
    const ticket = ticketInvalid ? "" : dTicket;
    setQuery((q) =>
      q.actor === dActor && q.ticket === ticket
        ? q
        : { ...q, actor: dActor, ticket, page: 1 },
    );
  }, [dActor, dTicket, ticketInvalid]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    auditApi
      .list(query)
      .then((r) => {
        if (id === requestId.current) setData(r);
      })
      .catch((err) => {
        if (id === requestId.current)
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load the audit log.",
          );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query]);

  function change(patch: Partial<AuditQuery>) {
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  }

  function clearFilters() {
    setActorText("");
    setTicketText("");
    setQuery(EMPTY);
  }

  const filtersActive = !!(
    query.actor ||
    query.businessUnit ||
    query.action ||
    query.entity ||
    query.ticket ||
    query.from ||
    query.to
  );
  const firstLoad = loading && !data;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Audit log</h2>
        <p className="text-sm text-slate-500">
          One row per ticket with a complete, read-only change history.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          aria-label="Search by person"
          placeholder="Person (name or email)"
          value={actorText}
          onChange={(e) => setActorText(e.target.value)}
          maxLength={100}
          className={cn(FIELD, "w-52")}
        />
        <select
          aria-label="Filter by business unit"
          className={FIELD}
          value={query.businessUnit}
          onChange={(e) => change({ businessUnit: e.target.value })}
        >
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by action"
          className={FIELD}
          value={query.action}
          onChange={(e) => change({ action: e.target.value })}
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {humanizeAction(a)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          className={FIELD}
          value={query.entity}
          onChange={(e) => change({ entity: e.target.value })}
        >
          <option value="">All types</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {humanizeAction(e)}
            </option>
          ))}
        </select>
        <div>
          <input
            type="search"
            aria-label="Filter by ticket number"
            aria-invalid={ticketInvalid || undefined}
            placeholder="Ticket (HD-12)"
            value={ticketText}
            onChange={(e) => setTicketText(e.target.value)}
            maxLength={20}
            className={cn(FIELD, "w-32", ticketInvalid && "border-rose-400")}
          />
        </div>
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
        {(filtersActive || actorText || ticketText) && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>
      {ticketInvalid && (
        <p className="text-xs text-rose-600">
          Use a ticket number such as HD-12 or 12.
        </p>
      )}

      <FormError message={error} />

      {firstLoad ? (
        <div
          className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : data && data.rows.length > 0 ? (
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
            {data.rows.map((r) => {
              return (
                <li key={r.ticket_id} className="animate-fade-in">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(r)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {r.title}
                        </span>
                        <span className="mt-1 block font-mono text-xs text-slate-500">
                          HD-{r.ticket_id}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:justify-end">
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
                          {r.business_unit_code === "HOTEL"
                            ? "Hotel"
                            : r.business_unit_code}
                        </span>
                        <span>
                          {r.total_change_count} change
                          {r.total_change_count === 1 ? "" : "s"}
                        </span>
                        <time dateTime={r.latest_modified_at}>
                          Updated {formatDateTime(r.latest_modified_at)}
                        </time>
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-400"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
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
            title="Nothing matches your filters"
            description="Try a different person, action or date range."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ScrollText}
            title="The audit log is empty"
            description="Actions will appear here as people use the helpdesk."
          />
        )
      ) : null}
      {selectedTicket && (
        <AuditTicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
