// A small colored pill: Published / Draft / Archived.
import type { ArticleStatus } from "../../types";
import { ARTICLE_STATUS_META } from "../../lib/kbMeta";
import { cn } from "../../lib/cn";

export default function ArticleStatusBadge({
  status,
}: {
  status: ArticleStatus;
}) {
  const meta = ARTICLE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  );
}
