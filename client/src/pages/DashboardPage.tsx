// The Dashboard tab (IT / ADMIN). Reloads whenever `version` changes (a ticket was changed elsewhere).
import { useEffect, useState } from "react";
import { Ticket as TicketIcon } from "lucide-react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { dashboardApi, type DashboardData } from "../api/dashboard";
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
  UnitOption,
  User,
} from "../types";
import BreakdownBars, {
  type BarItem,
} from "../components/dashboard/BreakdownBars";
import KpiCards from "../components/dashboard/KpiCards";
import OverdueBanner from "../components/dashboard/OverdueBanner";
import TrendChart from "../components/dashboard/TrendChart";
import EmptyState from "../components/ui/EmptyState";
import FormError from "../components/ui/FormError";
import Skeleton from "../components/ui/Skeleton";
import Button from "../components/ui/Button";

interface Props {
  user: User;
  version: number;
  onOpen: (id: number) => void;
  onShowTickets: (filters: Partial<TicketQuery>) => void;
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

export default function DashboardPage({
  user,
  version,
  onOpen,
  onShowTickets,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitError, setUnitError] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);

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
      <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
        {filterBar}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
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
    if (key === "urgent") {
      filters.priority = "URGENT";
      filters.activeOnly = true;
    }
    onShowTickets({ ...currentTicketFilters, ...filters });
  }

  return (
    <div
      className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}
      aria-busy={loading}
    >
      {filterBar}
      {error && <FormError message={error} />}
      <OverdueBanner
        count={kpis.overdue}
        tickets={data.overdueTickets}
        onOpen={onOpen}
        onViewAll={() =>
          onShowTickets({ ...currentTicketFilters, overdueOnly: true })
        }
      />
      <KpiCards kpis={kpis} onSelect={showKpi} />

      {trend.length > 1 && <TrendChart points={trend} />}

      <div className="grid gap-4 lg:grid-cols-2">
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
        <BreakdownBars
          title={
            filters.status
              ? "Tickets by business unit"
              : "Active tickets by business unit"
          }
          subtitle={breakdownSubtitle}
          items={unitItems}
        />
      )}
    </div>
  );
}
