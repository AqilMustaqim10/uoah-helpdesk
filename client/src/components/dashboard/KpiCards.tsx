// The row of number cards at the top of the dashboard. Numbers count up when they appear.
import { CheckCircle2, CircleDot, Clock, Flame, type LucideIcon } from "lucide-react";
import { m } from "framer-motion";
import { useCountUp } from "../../hooks/useCountUp";
import type { DashboardStats } from "../../types";

interface CardDef {
  key: keyof DashboardStats["kpis"];
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone: string; // colors of the small icon bubble
  suffix?: string;
}

const CARDS: CardDef[] = [
  {
    key: "open",
    label: "Open queue",
    hint: "Ready to be assigned",
    icon: CircleDot,
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    key: "in_progress",
    label: "In progress",
    hint: "Currently being handled",
    icon: Clock,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    key: "urgent",
    label: "High priority",
    hint: "Urgent active tickets",
    icon: Flame,
    tone: "bg-rose-50 text-rose-700",
  },
  {
    key: "resolved",
    label: "Resolved",
    hint: "Completed requests",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700",
  },
];

function Card({
  def,
  value,
  onSelect,
  className,
}: {
  def: CardDef;
  value: number;
  onSelect: () => void;
  className?: string;
}) {
  const shown = useCountUp(value);
  const Icon = def.icon;
  return (
    <m.button
      type="button"
      onClick={onSelect}
      data-motion-button="true"
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={`flex min-h-[132px] w-full flex-col rounded-2xl border border-border bg-surface p-5 text-left text-foreground shadow-sm transition hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${className ?? ""}`}
      aria-label={`View ${value} ${def.label.toLowerCase()} tickets`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{def.label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${def.tone}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-auto pt-5 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {shown}
        {def.suffix ?? ""}
      </p>
      {def.hint && <p className="mt-1 text-xs text-muted">{def.hint}</p>}
    </m.button>
  );
}

export default function KpiCards({
  kpis,
  onSelect,
}: {
  kpis: DashboardStats["kpis"];
  onSelect: (key: keyof DashboardStats["kpis"]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.key} className="dashboard-stagger-item">
          <Card
            def={c}
            value={kpis[c.key]}
            onSelect={() => onSelect(c.key)}
            className="kpi-card"
          />
        </div>
      ))}
    </div>
  );
}
