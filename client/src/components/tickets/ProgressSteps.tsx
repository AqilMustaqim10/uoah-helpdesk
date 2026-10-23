// The four steps of a ticket in a row (Open, In progress, Resolved, Closed) with the current one highlighted.
// A green line joins the steps that were reached. Changes animate softly.
import { Check } from "lucide-react";
import type { TicketStatus } from "../../types";
import { STATUS_META, STATUS_ORDER } from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";

export default function ProgressSteps({ status }: { status: TicketStatus }) {
  const current = STATUS_ORDER.indexOf(status);
  const last = STATUS_ORDER.length - 1;

  return (
    <ol className="flex items-start" aria-label="Ticket progress">
      {STATUS_ORDER.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center text-center"
          >
            {/* The line to the previous step: green once this step has been reached */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 right-1/2 top-3 h-0.5 -translate-y-1/2 transition-colors duration-300",
                  i <= current ? "bg-emerald-500" : "bg-slate-200",
                )}
              />
            )}
            {/* The line to the next step: green once the next step has been reached */}
            {i < last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-1/2 right-0 top-3 h-0.5 -translate-y-1/2 transition-colors duration-300",
                  i < current ? "bg-emerald-500" : "bg-slate-200",
                )}
              />
            )}

            {/* The circle (above the lines) */}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300",
                done && "bg-emerald-500 text-onbrand",
                active && "bg-brand text-onbrand",
                !done && !active && "bg-slate-100 text-slate-400",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>

            <span
              className={cn(
                "mt-1.5 text-xs",
                active ? "font-semibold text-slate-900" : "text-slate-500",
              )}
            >
              {STATUS_META[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
