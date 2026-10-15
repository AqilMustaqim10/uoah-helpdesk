// The search box, status chips (with counts) and the dropdown filters above the list.
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type {
  Priority,
  Role,
  TicketQuery,
  TicketStatus,
  UnitOption,
} from "../../types";
import {
  PRIORITY_LIST,
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
} from "../../lib/ticketMeta";
import { useDebounce } from "../../hooks/useDebounce";
import { cn } from "../../lib/cn";

interface Props {
  query: TicketQuery;
  counts: Record<TicketStatus, number> | undefined;
  role: Role;
  units: UnitOption[];
  onChange: (patch: Partial<TicketQuery>) => void;
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

export default function TicketFilters({
  query,
  counts,
  role,
  units,
  onChange,
}: Props) {
  // The text box updates instantly; the search itself runs 300 ms after you stop typing
  const [text, setText] = useState(query.q);
  const debounced = useDebounce(text, 300);

  useEffect(() => {
    if (debounced !== query.q) onChange({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = counts
    ? counts.OPEN + counts.IN_PROGRESS + counts.RESOLVED + counts.CLOSED
    : 0;
  const staff = role !== "USER";

  const chips: Array<{
    key: "" | TicketStatus;
    label: string;
    count: number | null;
  }> = [
    { key: "", label: "All", count: counts ? total : null },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      count: counts ? counts[s] : null,
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          placeholder="Search by number (HD-12), title, text or requester email"
          aria-label="Search tickets"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Status chips */}
        <div
          className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5"
          role="group"
          aria-label="Filter by status"
        >
          {chips.map((c) => {
            const active = query.status === c.key;
            return (
              <button
                key={c.key || "all"}
                type="button"
                onClick={() => onChange({ status: c.key })}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand text-onbrand shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {c.label}
                {c.count !== null && (
                  <span
                    className={cn(
                      "text-xs",
                      active ? "opacity-90" : "text-slate-400",
                    )}
                  >
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dropdown filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by priority"
            value={query.priority}
            onChange={(e) =>
              onChange({ priority: e.target.value as "" | Priority })
            }
            className={SELECT_CLASS}
          >
            <option value="">All priorities</option>
            {PRIORITY_LIST.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>

          {role === "ADMIN" && (
            <select
              aria-label="Filter by business unit"
              value={query.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          )}

          {staff && (
            <select
              aria-label="Filter by assignee"
              value={query.assignee}
              onChange={(e) =>
                onChange({
                  assignee: e.target.value as TicketQuery["assignee"],
                })
              }
              className={SELECT_CLASS}
            >
              <option value="">Any assignee</option>
              <option value="unassigned">Unassigned</option>
              <option value="me">Assigned to me</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
