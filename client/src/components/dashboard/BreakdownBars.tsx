// A card with horizontal bars (for example "Tickets by status"). The bars grow from zero when they appear.
import { useEffect, useState } from "react";

export interface BarItem {
  label: string;
  value: number;
  /** Tailwind color class of the bar, for example "bg-emerald-500". */
  bar: string;
  /** Optional tooltip. */
  title?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  items: BarItem[];
}

export default function BreakdownBars({ title, subtitle, items }: Props) {
  // Starts false so the bars begin at width 0, then flips so the CSS transition animates them to full size
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const total = items.reduce((sum, i) => sum + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label={title}
    >
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}

      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <li key={i.label} title={i.title}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-slate-600">{i.label}</span>
              <span className="tabular-nums text-slate-900">
                {i.value}
                {total > 0 && (
                  <span className="ml-1 text-xs text-slate-400">
                    {Math.round((i.value / total) * 100)}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${i.bar}`}
                style={{ width: shown ? `${(i.value / max) * 100}%` : "0%" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
