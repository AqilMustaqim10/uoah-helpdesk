// The Tickets tab: filters, the list, paging, and (for IT/ADMIN) the PDF export.
// "Export PDF" opens a window where you choose the business unit, IT staff and period.
// Clicking a row opens the ticket window (which AppShell shows). The list reloads whenever `version` changes.
import { useEffect, useRef, useState } from "react";
import { Download, SearchX, Ticket as TicketIcon } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { ticketsApi } from "../api/tickets";
import { useToast } from "../hooks/useToast";
import type {
  Assignee,
  TicketListResponse,
  TicketQuery,
  TicketStatus,
  UnitOption,
  User,
} from "../types";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import Pagination from "../components/ui/Pagination";
import Skeleton from "../components/ui/Skeleton";
import FormError from "../components/ui/FormError";
import ExportPdfModal from "../components/tickets/ExportPdfModal";
import TicketFilters from "../components/tickets/TicketFilters";
import TicketList from "../components/tickets/TicketList";
import { cn } from "../lib/cn";
import { TRANSITIONS } from "../lib/ticketMeta";

const EMPTY_QUERY: TicketQuery = {
  q: "",
  status: "",
  priority: "",
  unit: "",
  assignee: "",
  page: 1,
  activeOnly: false,
  overdueOnly: false,
  dueSoonOnly: false,
  sortBy: "created_at",
  sortDirection: "desc",
};

interface Props {
  user: User;
  /** Increases whenever something changed elsewhere, so the list must reload. */
  version: number;
  onOpen: (id: number) => void;
  onCreate: () => void;
  initialFilters?: Partial<TicketQuery> | null;
  onInitialFiltersApplied?: () => void;
}

export default function TicketsPage({
  user,
  version,
  onOpen,
  onCreate,
  initialFilters,
  onInitialFiltersApplied,
}: Props) {
  const staff = user.role !== "USER";
  const toast = useToast();

  const [query, setQuery] = useState<TicketQuery>(() => ({
    ...EMPTY_QUERY,
    ...initialFilters,
  }));
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [filterKey, setFilterKey] = useState(0); // changing it resets the search box
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAssignees, setBulkAssignees] = useState<Assignee[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("none");
  const [bulkStatus, setBulkStatus] = useState<TicketStatus | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkVersion, setBulkVersion] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (initialFilters) onInitialFiltersApplied?.();
  }, [initialFilters, onInitialFiltersApplied]);

  // ADMIN's unit filter (and the export window) need the list of units
  useEffect(() => {
    if (user.role !== "ADMIN") return;
    authApi
      .units()
      .then((r) => setUnits(r.units))
      .catch(() => undefined);
  }, [user.role]);

  // Load the list whenever the filters change (or something elsewhere changed)
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    ticketsApi
      .list(query)
      .then((r) => {
        if (id === requestId.current) setData(r);
      })
      .catch((err) => {
        if (id === requestId.current) {
          setError(
            err instanceof ApiError ? err.message : "Could not load tickets.",
          );
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [query, version, bulkVersion]);

  useEffect(() => {
    setBulkAssignee("none");
    if (!staff || selectedIds.length === 0) {
      setBulkAssignees([]);
      return;
    }
    let cancelled = false;
    Promise.all(selectedIds.map((id) => ticketsApi.assignees(id)))
      .then((results) => {
        if (cancelled) return;
        const eligible = results.map((result) => result.assignees);
        const common = eligible[0].filter((person) =>
          eligible.every((list) => list.some((candidate) => candidate.id === person.id)),
        );
        setBulkAssignees(common);
      })
      .catch((err) => {
        if (!cancelled) {
          setBulkAssignees([]);
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Could not load eligible assignees.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [staff, selectedIds.join(","), toast]);

  // If the current page no longer exists (for example the last row moved away), go back to page 1
  useEffect(() => {
    if (data && data.tickets.length === 0 && data.total > 0 && query.page > 1) {
      setQuery((q) => ({ ...q, page: 1 }));
    }
  }, [data, query.page]);

  function change(patch: Partial<TicketQuery>) {
    // Changing a filter returns to page 1; changing the page keeps the filters
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }));
  }

  function sortBy(key: NonNullable<TicketQuery["sortBy"]>) {
    const direction =
      query.sortBy === key
        ? query.sortDirection === "asc"
          ? "desc"
          : "asc"
        : key === "created_at"
          ? "desc"
          : "asc";
    change({ sortBy: key, sortDirection: direction });
  }

  function clearFilters() {
    setQuery(EMPTY_QUERY);
    setFilterKey((k) => k + 1);
  }

  const filtersActive = !!(
    query.q ||
    query.status ||
    query.priority ||
    query.unit ||
    query.assignee ||
    query.activeOnly ||
    query.overdueOnly ||
    query.dueSoonOnly ||
    query.createdWithin
  );
  const firstLoad = loading && !data;

  function toggleTicket(id: number) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((selected) => selected !== id) : [...ids, id],
    );
  }

  function toggleAllOnPage() {
    const ids = data?.tickets.map((ticket) => ticket.id) ?? [];
    setSelectedIds((selected) =>
      ids.every((id) => selected.includes(id))
        ? selected.filter((id) => !ids.includes(id))
        : [...new Set([...selected, ...ids])],
    );
  }

  async function applyBulkAction(kind: "assignee" | "status") {
    if (bulkBusy || selectedIds.length === 0) return;
    if (kind === "assignee" && bulkAssignee === "none") return;
    if (kind === "status" && !bulkStatus) return;
    setBulkBusy(true);
    let previousStatuses: Array<TicketStatus | undefined> = [];
    if (kind === "status") {
      const snapshots = await Promise.allSettled(
        selectedIds.map(async (id) => {
          const current = data?.tickets.find((ticket) => ticket.id === id);
          return current ? current.status : (await ticketsApi.get(id)).ticket.status;
        }),
      );
      previousStatuses = snapshots.map((snapshot) =>
        snapshot.status === "fulfilled" ? snapshot.value : undefined,
      );
    }
    const actions = selectedIds.map((id) =>
      kind === "assignee"
        ? ticketsApi.setAssignee(
            id,
            bulkAssignee === "" ? null : Number(bulkAssignee),
          )
        : ticketsApi.setStatus(id, bulkStatus as TicketStatus),
    );
    const results = await Promise.allSettled(actions);
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      const succeededIds = selectedIds.filter(
        (_, index) => results[index].status === "fulfilled",
      );
      const missingUndoSnapshots =
        kind === "status"
          ? succeededIds.filter(
              (id) => previousStatuses[selectedIds.indexOf(id)] === undefined,
            ).length
          : 0;
      const undoTargets =
        kind === "status"
          ? succeededIds.flatMap((id) => {
              const previousStatus = previousStatuses[selectedIds.indexOf(id)];
              return previousStatus &&
                TRANSITIONS[bulkStatus as TicketStatus].some(
                  (transition) => transition.to === previousStatus,
                )
                ? [{ id, status: previousStatus }]
                : [];
            })
          : [];
      const undoStatusChanges = async () => {
        const undoResults = await Promise.allSettled(
          undoTargets.map(({ id, status }) => ticketsApi.setStatus(id, status)),
        );
        const undoFailed = undoResults.filter(
          (result) => result.status === "rejected",
        ).length;
        setBulkVersion((v) => v + 1);
        if (undoFailed > 0) {
          toast.error(
            `${undoFailed} ticket${undoFailed === 1 ? "" : "s"} could not be restored.`,
          );
        } else {
          toast.success(
            `Status changes undone for ${undoTargets.length} ticket${undoTargets.length === 1 ? "" : "s"}.`,
          );
        }
      };
      const statusMessage =
        undoTargets.length > 0 && undoTargets.length < succeeded
          ? `Status updated for ${succeeded} tickets; ${undoTargets.length} can be undone.`
          : `Status updated for ${succeeded} ticket${succeeded === 1 ? "" : "s"}.`;
      toast.success(
        kind === "assignee"
          ? `Assignment updated for ${succeeded} ticket${succeeded === 1 ? "" : "s"}.`
          : statusMessage,
        undoTargets.length > 0
          ? { label: "Undo", onClick: () => void undoStatusChanges() }
          : undefined,
      );
      if (missingUndoSnapshots > 0) {
        toast.error(
          `Previous status could not be loaded for ${missingUndoSnapshots} ticket${missingUndoSnapshots === 1 ? "" : "s"}; those changes cannot be undone.`,
        );
      }
      setSelectedIds([]);
      setBulkVersion((v) => v + 1);
    }
    if (failed > 0) {
      toast.error(
        `${failed} ticket${failed === 1 ? "" : "s"} could not be updated. Check their status and assignment permissions.`,
      );
      if (succeeded === 0) setBulkVersion((v) => v + 1);
    }
    setBulkBusy(false);
  }

  return (
    <div className="space-y-4">
      <TicketFilters
        key={filterKey}
        query={query}
        counts={data?.counts}
        role={user.role}
        units={units}
        onChange={change}
      />

      <FormError message={error} />

      {firstLoad ? (
        <div
          className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-busy="true"
          role="status"
          aria-label="Loading tickets"
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
          {/* Ticket count on the left, export button (IT/ADMIN) on the right */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {data.total} ticket{data.total === 1 ? "" : "s"}
            </p>
            {staff && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={() => setExportOpen(true)}
              >
                Export PDF
              </Button>
            )}
          </div>

          {/* Slightly dimmed while a new page is loading */}
          <div
            aria-busy={loading}
            className={cn("transition-opacity duration-150", loading && "opacity-60")}
          >
            <TicketList
              tickets={data.tickets}
              role={user.role}
              onOpen={onOpen}
              selectedIds={selectedIds}
              onToggle={toggleTicket}
              onToggleAll={toggleAllOnPage}
              sortBy={query.sortBy ?? "created_at"}
              sortDirection={query.sortDirection ?? "desc"}
              onSort={sortBy}
            />
            </div>
            {staff && selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 p-3">
                <span className="mr-1 text-sm font-medium text-slate-700">
                  {selectedIds.length} selected
                </span>
                <select
                  aria-label="Assign selected tickets"
                  value={bulkAssignee}
                  onChange={(event) => setBulkAssignee(event.target.value)}
                  disabled={bulkBusy}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  <option value="none" disabled>
                    Choose assignee
                  </option>
                  <option value="">Unassign</option>
                  {bulkAssignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkBusy}
                  onClick={() => void applyBulkAction("assignee")}
                >
                  Apply assignment
                </Button>
                <select
                  aria-label="Change status of selected tickets"
                  value={bulkStatus}
                  onChange={(event) =>
                    setBulkStatus(event.target.value as TicketStatus | "")
                  }
                  disabled={bulkBusy}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  <option value="">Choose status</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkBusy}
                  disabled={!bulkStatus}
                  onClick={() => void applyBulkAction("status")}
                >
                  Apply status
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={bulkBusy}
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </Button>
              </div>
            )}
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
            description="Try a different search or clear the filters."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={TicketIcon}
            title="No tickets yet"
            description={
              user.role === "USER"
                ? "When you report a problem it will appear here."
                : "New tickets for your business unit will appear here."
            }
            action={<Button onClick={onCreate}>Create ticket</Button>}
          />
        )
      ) : null}

      {exportOpen && (
        <ErrorBoundary onClose={() => setExportOpen(false)}>
          <ExportPdfModal
            user={user}
            filters={query}
            units={units}
            onClose={() => setExportOpen(false)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
