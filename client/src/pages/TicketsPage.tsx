// The Tickets tab: filters, the list, paging, and (for IT/ADMIN) the CSV export.
// Clicking a row opens the ticket window (which AppShell shows). The list reloads whenever `version` changes.
import { useEffect, useRef, useState } from "react";
import { Download, SearchX, Ticket as TicketIcon } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { ticketsApi } from "../api/tickets";
import { useToast } from "../hooks/useToast";
import { saveBlob } from "../lib/download";
import type {
  TicketListResponse,
  TicketQuery,
  UnitOption,
  User,
} from "../types";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import Skeleton from "../components/ui/Skeleton";
import FormError from "../components/ui/FormError";
import TicketFilters from "../components/tickets/TicketFilters";
import TicketList from "../components/tickets/TicketList";
import { cn } from "../lib/cn";

const EMPTY_QUERY: TicketQuery = {
  q: "",
  status: "",
  priority: "",
  unit: "",
  assignee: "",
  page: 1,
};

interface Props {
  user: User;
  /** Increases whenever something changed elsewhere, so the list must reload. */
  version: number;
  onOpen: (id: number) => void;
  onCreate: () => void;
}

export default function TicketsPage({
  user,
  version,
  onOpen,
  onCreate,
}: Props) {
  const toast = useToast();
  const staff = user.role !== "USER";

  const [query, setQuery] = useState<TicketQuery>(EMPTY_QUERY);
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [exporting, setExporting] = useState(false);
  const [filterKey, setFilterKey] = useState(0); // changing it resets the search box
  const requestId = useRef(0);

  // ADMIN's unit filter needs the list of units
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
  }, [query, version]);

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

  function clearFilters() {
    setQuery(EMPTY_QUERY);
    setFilterKey((k) => k + 1);
  }

  /** Downloads a CSV of the tickets that match the current filters. */
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await ticketsApi.exportCsv(query);
      saveBlob(blob, filename);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not export. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  const filtersActive = !!(
    query.q ||
    query.status ||
    query.priority ||
    query.unit ||
    query.assignee
  );
  const firstLoad = loading && !data;

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
                loading={exporting}
                onClick={() => void exportCsv()}
              >
                Export CSV
              </Button>
            )}
          </div>

          {/* Slightly dimmed while a new page is loading */}
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <TicketList
              tickets={data.tickets}
              role={user.role}
              onOpen={onOpen}
            />
          </div>
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
    </div>
  );
}
