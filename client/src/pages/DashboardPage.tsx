// The Dashboard tab (IT / ADMIN). Reloads whenever `version` changes (a ticket was changed elsewhere).
import { useEffect, useState } from "react";
import { Ticket as TicketIcon } from "lucide-react";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { PRIORITY_LIST, PRIORITY_META, STATUS_META } from "../lib/ticketMeta";
import type { DashboardStats, User } from "../types";
import BreakdownBars, {
  type BarItem,
} from "../components/dashboard/BreakdownBars";
import KpiCards from "../components/dashboard/KpiCards";
import OverdueBanner from "../components/dashboard/OverdueBanner";
import EmptyState from "../components/ui/EmptyState";
import FormError from "../components/ui/FormError";
import Skeleton from "../components/ui/Skeleton";

interface Props {
  user: User;
  version: number;
  onOpen: (id: number) => void;
}

// Bar colors for each priority (only the colors dark mode knows about)
const PRIORITY_BAR: Record<string, string> = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-slate-400",
  HIGH: "bg-indigo-500",
  URGENT: "bg-rose-500",
};

export default function DashboardPage({ user, version, onOpen }: Props) {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .stats()
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
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (error && !data) return <FormError message={error} />;

  if (!data) {
    return (
      <div
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading dashboard"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (data.kpis.total === 0) {
    return (
      <EmptyState
        icon={TicketIcon}
        title="No tickets yet"
        description="Statistics will appear here as soon as the first ticket is created."
      />
    );
  }

  const { kpis } = data;

  const statusItems: BarItem[] = [
    { label: STATUS_META.OPEN.label, value: kpis.open, bar: "bg-emerald-500" },
    {
      label: STATUS_META.IN_PROGRESS.label,
      value: kpis.in_progress,
      bar: "bg-amber-500",
    },
    {
      label: STATUS_META.RESOLVED.label,
      value: kpis.resolved,
      bar: "bg-emerald-300",
    },
    {
      label: STATUS_META.CLOSED.label,
      value: kpis.closed,
      bar: "bg-slate-300",
    },
  ];

  const priorityItems: BarItem[] = PRIORITY_LIST.map((p) => ({
    label: PRIORITY_META[p].label,
    value: data.byPriority[p] ?? 0,
    bar: PRIORITY_BAR[p],
  }));

  const unitItems: BarItem[] = data.byUnit.map((u) => ({
    label: u.code,
    value: u.n,
    bar: "bg-brand",
    title: u.name,
  }));

  return (
    <div className="space-y-4">
      <OverdueBanner
        count={kpis.overdue}
        tickets={data.overdueTickets}
        onOpen={onOpen}
      />
      <KpiCards kpis={kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownBars
          title="Tickets by status"
          subtitle="All tickets"
          items={statusItems}
        />
        <BreakdownBars
          title="Active tickets by priority"
          subtitle="Open and in progress"
          items={priorityItems}
        />
      </div>

      {user.role === "ADMIN" && unitItems.length > 0 && (
        <BreakdownBars
          title="Active tickets by business unit"
          subtitle="Open and in progress"
          items={unitItems}
        />
      )}
    </div>
  );
}
