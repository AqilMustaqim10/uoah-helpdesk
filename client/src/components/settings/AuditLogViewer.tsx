// The audit log (ADMIN only): who did what, and when. Read-only; the log can never be edited.
// Filters: person, action, type, ticket number and a date range. 50 rows per page, newest first.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ScrollText, SearchX } from "lucide-react";
import {
  auditApi,
  type AuditListResponse,
  type AuditQuery,
} from "../../api/audit";
import { ApiError } from "../../api/client";
import { useDebounce } from "../../hooks/useDebounce";
import { describeAudit, humanizeAction } from "../../lib/auditText";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import FormError from "../ui/FormError";
import Pagination from "../ui/Pagination";
import Skeleton from "../ui/Skeleton";

const EMPTY: AuditQuery = {
  actor: "",
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
  "export",
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
  const [openId, setOpenId] = useState<number | null>(null); // the row whose raw details are shown
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
          Every important action, newest first. This log cannot be edited or
          deleted.
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
            {data.total} event{data.total === 1 ? "" : "s"}
          </p>
          <ul
            className={cn(
              "divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity",
              loading && "opacity-60",
            )}
          >
            {data.rows.map((r) => {
              const open = openId === r.id;
              const who = r.actor_name ?? "System";
              return (
                <li key={r.id} className="animate-fade-in px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={who} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-slate-700">
                        <span
                          className="font-medium text-slate-900"
                          title={r.actor_email ?? undefined}
                        >
                          {who}
                        </span>{" "}
                        {describeAudit(r.action, r.details ?? {})}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span>{formatDateTime(r.created_at)}</span>
                        {r.ticket_id && (
                          <span className="font-mono text-slate-500">
                            HD-{r.ticket_id}
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500">
                          {r.entity_type}
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : r.id)}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                        >
                          Details
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              open && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </button>
                      </div>
                      {open && (
                        // The raw record, for whoever needs the exact values
                        <pre className="mt-2 max-h-48 animate-fade-in overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                          {JSON.stringify(
                            {
                              action: r.action,
                              entity: `${r.entity_type} ${r.entity_id}`,
                              details: r.details,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      )}
                    </div>
                  </div>
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
    </div>
  );
}
