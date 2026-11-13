// The article cards. Each card is one button that opens the article.
import { Globe2 } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ArticleSummary } from "../../types";
import { timeAgo } from "../../lib/format";
import { ARTICLE_CATEGORY_META } from "../../lib/kbMeta";
import ArticleStatusBadge from "./ArticleStatusBadge";

interface Props {
  articles: ArticleSummary[];
  /** Staff also see the status badge (a USER only ever sees published articles). */
  showStatus: boolean;
  onOpen: (id: number) => void;
}

export default function ArticleList({ articles, showStatus, onOpen }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <m.ul layout={!reduceMotion} className="grid gap-3 md:grid-cols-2">
      <AnimatePresence initial={false}>
        {articles.map((a) => (
          <m.li
            key={a.id}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.98,
                    transition: { duration: 0.14 },
                  }
            }
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className="flex h-full w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                  {a.title}
                </h3>
                {showStatus && <ArticleStatusBadge status={a.status} />}
              </div>

              <span className="w-fit rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                {ARTICLE_CATEGORY_META[a.category]}
              </span>

              <p className="line-clamp-2 text-sm text-slate-500">
                {a.excerpt}
              </p>

              {a.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                  {a.tags.length > 4 && (
                    <span className="text-xs text-slate-400">
                      +{a.tags.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-slate-400">
                {a.unit_code ? (
                  <span className="font-mono">{a.unit_code}</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Globe2 className="h-3 w-3" aria-hidden /> All units
                  </span>
                )}
                <span>Updated {timeAgo(a.updated_at)}</span>
              </div>
            </button>
          </m.li>
        ))}
      </AnimatePresence>
    </m.ul>
  );
}
