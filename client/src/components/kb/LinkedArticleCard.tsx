// A knowledge base article shown as a small card. Three looks:
//  - in the ticket timeline: the whole card is a button that opens the article
//  - in the reply box (onRemove given): "will be sent with your reply", with a remove button
//  - no title (the article is no longer available to this viewer): a quiet notice
// The title and excerpt are plain text (React escapes them), so nobody can inject HTML.
import { BookOpen, ChevronRight, X } from "lucide-react";

interface Props {
  articleId: number;
  /** null = the article is no longer available to this viewer (unpublished, archived or moved). */
  title: string | null;
  excerpt?: string | null;
  /** Timeline mode: opens the article. */
  onOpen?: (articleId: number) => void;
  /** Reply-box mode: removes the link before sending. */
  onRemove?: () => void;
}

export default function LinkedArticleCard({
  articleId,
  title,
  excerpt,
  onOpen,
  onRemove,
}: Props) {
  if (title === null) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <BookOpen className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />A
        knowledge base article was linked here, but it is no longer available.
      </p>
    );
  }

  const body = (
    <>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <BookOpen className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand">
          {onRemove
            ? "Linked article: will be sent with your reply"
            : "Knowledge base article"}
        </span>
        <span className="mt-0.5 block break-words text-sm font-semibold text-slate-900">
          {title}
        </span>
        {excerpt && (
          <span className="mt-0.5 line-clamp-2 break-words text-xs text-slate-500">
            {excerpt}
          </span>
        )}
        {onOpen && (
          <span className="mt-1.5 inline-block text-xs font-medium text-brand">
            View the solution
          </span>
        )}
      </span>
    </>
  );

  // Reply box: a card with a remove button (not clickable)
  if (onRemove) {
    return (
      <div className="flex animate-fade-in items-start gap-3 rounded-xl border border-brand/30 bg-white p-3">
        {body}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the linked article "${title}"`}
          title="Remove the link"
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Timeline: the whole card opens the article
  return (
    <button
      type="button"
      onClick={() => onOpen?.(articleId)}
      aria-label={`Open the knowledge base article "${title}"`}
      className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand/40 hover:shadow-sm"
    >
      {body}
      <ChevronRight
        className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand"
        aria-hidden
      />
    </button>
  );
}
