// The search box, status chips (staff only) and unit filter (ADMIN only) above the article list.
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { ArticleQuery, UnitOption } from "../../types";
import { ARTICLE_STATUS_LIST, ARTICLE_STATUS_META } from "../../lib/kbMeta";
import { useDebounce } from "../../hooks/useDebounce";
import { cn } from "../../lib/cn";

interface Props {
  query: ArticleQuery;
  staff: boolean;
  isAdmin: boolean;
  units: UnitOption[];
  onChange: (patch: Partial<ArticleQuery>) => void;
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 transition " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

export default function ArticleFilters({
  query,
  staff,
  isAdmin,
  units,
  onChange,
}: Props) {
  // The text box updates instantly; the search itself runs 300 ms after you stop typing
  const [text, setText] = useState(query.q);
  const debounced = useDebounce(text, 300);

  useEffect(() => {
    if (debounced !== query.q) onChange({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: Array<{ key: ArticleQuery["status"]; label: string }> = [
    { key: "", label: "All" },
    ...ARTICLE_STATUS_LIST.map((s) => ({
      key: s,
      label: ARTICLE_STATUS_META[s].label,
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
          placeholder="Search articles by title, text or tag"
          aria-label="Search articles"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {(staff || isAdmin) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {staff && (
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
                      "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand text-onbrand shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <select
              aria-label="Filter by business unit"
              className={SELECT_CLASS}
              value={query.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
            >
              <option value="">All units</option>
              <option value="global">Global only</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
