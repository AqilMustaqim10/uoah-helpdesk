// "These articles might already answer your question": shown under the title while creating a ticket.
//  - waits until you stop typing (half a second), then asks the server
//  - an article opens inline (no extra window); "This solved my problem" closes the form without a ticket
//  - a failed lookup is ignored: suggestions are a bonus and must never get in the way
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Loader2 } from "lucide-react";
import { kbApi, type ArticleSuggestion } from "../../api/kb";
import { useDebounce } from "../../hooks/useDebounce";
import { cn } from "../../lib/cn";
import Button from "../ui/Button";

interface Props {
  title: string;
  onSolved: () => void;
}

type BodyState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error" };

export default function SuggestedArticles({ title, onSolved }: Props) {
  const debounced = useDebounce(title.trim(), 500);
  const [items, setItems] = useState<ArticleSuggestion[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [bodies, setBodies] = useState<Record<number, BodyState>>({});
  const requestId = useRef(0);

  // Look for articles whenever the title (after a pause) changes
  useEffect(() => {
    const id = ++requestId.current;
    if (debounced.length < 4) {
      setItems([]);
      setOpenId(null);
      return;
    }
    kbApi
      .suggest(debounced)
      .then((r) => {
        if (id === requestId.current) setItems(r.articles);
      })
      .catch(() => {
        if (id === requestId.current) setItems([]);
      });
  }, [debounced]);

  /** Opens or closes one article; its text is loaded the first time it is opened. */
  function toggle(articleId: number) {
    if (openId === articleId) {
      setOpenId(null);
      return;
    }
    setOpenId(articleId);
    if (bodies[articleId]) return;

    setBodies((b) => ({ ...b, [articleId]: { status: "loading" } }));
    kbApi
      .get(articleId)
      .then((r) =>
        setBodies((b) => ({
          ...b,
          [articleId]: { status: "ready", text: r.article.body },
        })),
      )
      .catch(() =>
        setBodies((b) => ({ ...b, [articleId]: { status: "error" } })),
      );
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Suggested articles"
      className="animate-fade-in rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        These articles might already answer your question
      </p>

      <ul className="space-y-1.5">
        {items.map((a) => {
          const open = openId === a.id;
          const body = bodies[a.id];
          return (
            <li
              key={a.id}
              className="rounded-lg border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => toggle(a.id)}
                aria-expanded={open}
                className="flex w-full items-start gap-2 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {a.title}
                  </span>
                  {!open && (
                    <span className="block truncate text-xs text-slate-500">
                      {a.excerpt}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {open && (
                <div className="animate-fade-in border-t border-slate-200 px-3 py-2">
                  {!body || body.status === "loading" ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-slate-400"
                      aria-label="Loading"
                    />
                  ) : body.status === "error" ? (
                    <p className="text-sm text-slate-500">
                      Could not load this article.
                    </p>
                  ) : (
                    // Plain text: React escapes it, so nobody can inject HTML
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-700">
                      {body.text}
                    </p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="secondary" onClick={onSolved}>
                      This solved my problem
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
