// Names and colors for knowledge base article statuses.
import type { ArticleCategory, ArticleStatus } from "../types";

export const ARTICLE_CATEGORY_LIST: ArticleCategory[] = [
  "access_accounts",
  "network_wifi",
  "devices_printing",
  "email_collaboration",
  "hospitality_systems",
  "security_policies",
  "guides_howtos",
  "other",
];

export const ARTICLE_CATEGORY_META: Record<ArticleCategory, string> = {
  access_accounts: "Accounts & access",
  network_wifi: "Network & Wi-Fi",
  devices_printing: "Devices & printing",
  email_collaboration: "Email & collaboration",
  hospitality_systems: "Hospitality systems",
  security_policies: "Security & policies",
  guides_howtos: "Guides & how-tos",
  other: "Other",
};

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
