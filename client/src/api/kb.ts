// Knowledge base server calls (they match server/src/routes/kb.ts and kbSuggest.ts).
import { api } from "./client";
import type {
  ArticleDetailResponse,
  ArticleInput,
  ArticleListResponse,
  ArticleQuery,
} from "../types";

/** One suggestion shown while creating a ticket. */
export interface ArticleSuggestion {
  id: number;
  title: string;
  excerpt: string;
  unit_code: string | null;
  tags: string[];
}

function toQueryString(q: ArticleQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.unit) p.set("unit", q.unit);
  p.set("page", String(q.page));
  return p.toString();
}

export const kbApi = {
  list: (q: ArticleQuery) =>
    api.get<ArticleListResponse>(`/kb?${toQueryString(q)}`),
  get: (id: number) => api.get<ArticleDetailResponse>(`/kb/${id}`),
  create: (body: ArticleInput) => api.post<ArticleDetailResponse>("/kb", body),
  update: (id: number, body: Partial<ArticleInput>) =>
    api.patch<ArticleDetailResponse>(`/kb/${id}`, body),

  /** Up to 5 published articles that may answer the question in this title. */
  suggest: (q: string) =>
    api.get<{ articles: ArticleSuggestion[] }>(
      `/kb/suggest?q=${encodeURIComponent(q)}`,
    ),

  uploadFiles: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return api.post<ArticleDetailResponse>(`/kb/${id}/files`, form);
  },
  deleteFile: (fileId: number) =>
    api.del<ArticleDetailResponse>(`/kb/files/${fileId}`),
};
