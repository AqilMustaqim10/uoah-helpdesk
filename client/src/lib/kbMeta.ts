// Names and colors for knowledge base article statuses.
import type { ArticleStatus } from "../types";

export const ARTICLE_STATUS_LIST: ArticleStatus[] = [
  "PUBLISHED",
  "DRAFT",
  "ARCHIVED",
];

export const ARTICLE_STATUS_META: Record<
  ArticleStatus,
  { label: string; chip: string }
> = {
  PUBLISHED: {
    label: "Published",
    chip: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
  },
  DRAFT: { label: "Draft", chip: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800" },
  ARCHIVED: {
    label: "Archived",
    chip: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-800",
  },
};
