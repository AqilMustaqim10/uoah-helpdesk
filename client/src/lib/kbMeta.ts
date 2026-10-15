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
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  DRAFT: { label: "Draft", chip: "bg-amber-50 text-amber-700 ring-amber-200" },
  ARCHIVED: {
    label: "Archived",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};
