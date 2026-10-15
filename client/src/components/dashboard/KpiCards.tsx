// The row of number cards at the top of the dashboard. Numbers count up when they appear.
import {
  CheckCircle2,
  CircleDot,
  Clock,
  Flame,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { useCountUp } from "../../hooks/useCountUp";
import type { DashboardStats } from "../../types";

interface CardDef {
  key: keyof DashboardStats["kpis"];
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone: string; // colors of the small icon bubble
}

const CARDS: CardDef[] = [
  {
    key: "total",
    label: "Total tickets",
    icon: Ticket,
    tone: "bg-slate-100 text-slate-600",
  },
  {
    key: "open",
    label: "Open",
    icon: CircleDot,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "in_progress",
    label: "In progress",
    icon: Clock,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    key: "resolved",
    label: "Resolved",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "urgent",
    label: "Urgent",
    hint: "Still open or in progress",
    icon: Flame,
    tone: "bg-rose-50 text-rose-700",
  },
];

function Card({ def, value }: { def: CardDef; value: number }) {
  const shown = useCountUp(value);
  const Icon = def.icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{def.label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${def.tone}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
        {shown}
      </p>
      {def.hint && <p className="mt-0.5 text-xs text-slate-400">{def.hint}</p>}
    </div>
  );
}

export default function KpiCards({ kpis }: { kpis: DashboardStats["kpis"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {CARDS.map((c) => (
        <Card key={c.key} def={c} value={kpis[c.key]} />
      ))}
    </div>
  );
}
