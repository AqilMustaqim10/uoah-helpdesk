// The four steps of a ticket (Open, In progress, Resolved, Closed) with the current one highlighted.
import { Check } from "lucide-react";
import type { TicketStatus } from "../../types";
import { STATUS_META, STATUS_ORDER } from "../../lib/ticketMeta";
import { cn } from "../../lib/cn";

export default function ProgressSteps({ status }: { status: TicketStatus }) {
  const current = STATUS_ORDER.indexOf(status);

  return (
    <ol aria-label="Ticket progress">
      {STATUS_ORDER.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === STATUS_ORDER.length - 1;
        return (
          <li
            key={s}
            className="flex gap-3"
            aria-current={active ? "step" : undefined}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300",
                  done && "bg-emerald-500 text-onbrand",
                  active && "bg-brand text-onbrand",
                  !done && !active && "bg-slate-100 text-slate-400",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              {!last && (
                <span
                  className={cn(
                    "min-h-4 w-0.5 flex-1 transition-colors duration-300",
                    done ? "bg-emerald-500" : "bg-slate-200",
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                "pb-4 text-sm leading-6 transition-colors",
                active ? "font-semibold text-slate-900" : "text-slate-500",
              )}
            >
              {STATUS_META[s].label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
