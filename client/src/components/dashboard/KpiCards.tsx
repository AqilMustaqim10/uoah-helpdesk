// The number tiles of the dashboard bento. Numbers count up when they appear.
// DashboardPage decides where each tile sits on the grid (and which ones are large).
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Clock,
  Flame,
  Gauge,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { useCountUp } from "../../hooks/useCountUp";
import type { DashboardStats } from "../../types";
import { cn } from "../../lib/cn";
import { BentoCard } from "../ui/Bento";

export type KpiKey = keyof DashboardStats["kpis"];

interface KpiDef {
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Colors of the small icon bubble, light and dark. */
  tone: string;
  suffix?: string;
}

const DEFS: Partial<Record<KpiKey, KpiDef>> = {
  total: {
    label: "Total tickets",
    hint: "Everything in view",
    icon: Ticket,
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  open: {
    label: "Open",
    icon: CircleDot,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  in_progress: {
    label: "In progress",
    icon: Clock,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  urgent: {
    label: "Urgent",
    hint: "Still open or in progress",
    icon: Flame,
    tone: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  sla: {
    label: "SLA met",
    hint: "Active tickets on track",
    icon: Gauge,
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    suffix: "%",
  },
};

interface Props {
  kpiKey: KpiKey;
  value: number;
  onSelect: () => void;
  /** Grid placement, e.g. "col-span-2". */
  className?: string;
  /** A bigger tile with a bigger number. */
  large?: boolean;
}

export function KpiCard({ kpiKey, value, onSelect, className, large }: Props) {
  const def = DEFS[kpiKey];
  const shown = useCountUp(value);
  // The SLA bar starts empty and fills once the tile is on screen
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!def) return null;
  const Icon = def.icon;
  const isSla = kpiKey === "sla";

  return (
    <BentoCard
      className={className}
      onClick={onSelect}
      disabled={value === 0}
      aria-label={`View ${value} ${def.label.toLowerCase()} tickets`}
      innerClassName="flex flex-col"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">{def.label}</p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            def.tone,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-semibold tabular-nums text-slate-900 dark:text-slate-100",
          // the SLA figure is a metric like a timestamp: monospaced
          isSla && "font-mono",
          large ? "text-4xl" : "text-3xl",
        )}
      >
        {shown}
        {def.suffix ?? ""}
      </p>
      {isSla && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
            style={{ width: filled ? `${Math.min(100, value)}%` : "0%" }}
          />
        </div>
      )}
      {def.hint && (
        <p className="mt-auto pt-1.5 text-xs text-slate-400 dark:text-slate-500">
          {def.hint}
        </p>
      )}
    </BentoCard>
  );
}
