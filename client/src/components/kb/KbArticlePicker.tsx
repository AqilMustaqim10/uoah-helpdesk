// A search box with a dropdown (autocomplete) for choosing the knowledge base article to link in a reply.
// Only articles that may really be linked to THIS ticket are offered (the server decides, and checks again when you send).
//  - click the box: the newest articles appear; type to search by title, text or tag
//  - Arrow keys move, Enter chooses, Esc closes the list (and only the list, not the ticket window)
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, Loader2, Search } from "lucide-react";
import { kbApi, type LinkableArticle } from "../../api/kb";
import { useDebounce } from "../../hooks/useDebounce";
import { cn } from "../../lib/cn";

interface Props {
  ticketId: number;
  disabled?: boolean;
  onSelect: (article: LinkableArticle) => void;
}

export default function KbArticlePicker({
  ticketId,
  disabled,
  onSelect,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const [text, setText] = useState("");
  const debounced = useDebounce(text.trim(), 250); // the search runs 250 ms after you stop typing
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LinkableArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0); // the highlighted row

  // Load results while the list is open (an empty box shows the newest articles)
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    kbApi
      .searchLinkable(ticketId, debounced)
      .then((r) => {
        if (id !== requestId.current) return; // an older search that finished late
        setItems(r.articles);
        setActive(0);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setItems([]);
        setFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [open, debounced, ticketId]);

  // A click anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(article: LinkableArticle) {
    onSelect(article);
    setText("");
    setItems([]);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(Math.max(items.length - 1, 0), i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter must never do anything else here
      if (open && items[active]) choose(items[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation(); // closes the list only, the ticket window stays open
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          role="combobox"
          aria-label="Search the knowledge base to link an article"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && items[active] ? `${listId}-${active}` : undefined
          }
          value={text}
          disabled={disabled}
          maxLength={100}
          placeholder="Search the knowledge base to link an article"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-label="Searching"
          />
        )}
      </div>

      {/* The results sit in the normal flow under the box (no floating layer), so a scrolling window never clips them */}
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Knowledge base articles"
          className="mt-1 max-h-64 animate-fade-in overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {failed ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Could not search right now. Please try again.
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              {loading
                ? "Searching…"
                : debounced
                  ? "No published article matches. Only published articles of this business unit, or global ones, can be linked."
                  : "There are no published articles to link yet."}
            </p>
          ) : (
            items.map((a, i) => (
              <div
                key={a.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(a)}
                className={cn(
                  "cursor-pointer border-b border-slate-100 px-3 py-2 last:border-b-0",
                  i === active && "bg-slate-100",
                )}
              >
                <div className="flex items-center gap-2">
                  <BookOpen
                    className="h-4 w-4 shrink-0 text-brand"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {a.title}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                    {a.unit_code ?? "All units"}
                  </span>
                </div>
                <p className="mt-0.5 truncate pl-6 text-xs text-slate-500">
                  {a.excerpt}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
