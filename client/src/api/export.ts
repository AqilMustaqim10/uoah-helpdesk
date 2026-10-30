// The PDF export server call (matches server/src/routes/export.ts). IT and ADMIN only.
import { api } from "./client";
import type { ExportPeriod } from "../lib/reportPeriod";
import type { TicketQuery } from "../types";

export interface ExportOptions {
  /** 'all', or a business unit id (IT always sends their own). */
  bu: string;
  period: ExportPeriod;
  /** YYYY-MM-DD, used by day and week. */
  date: string;
  month: number;
  year: number;
  /** Also apply the status, priority, assignee and search filters of the ticket list. */
  applyListFilters: boolean;
}

/** YOUR time zone, so a "day" or a "month" means the same for you as on screen. */
function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function exportPdf(listFilters: TicketQuery, o: ExportOptions) {
  const p = new URLSearchParams();

  if (o.applyListFilters) {
    if (listFilters.q.trim()) p.set("q", listFilters.q.trim());
    if (listFilters.status) p.set("status", listFilters.status);
    if (listFilters.priority) p.set("priority", listFilters.priority);
    if (listFilters.assignee) p.set("assignee", listFilters.assignee);
  }

  p.set("bu", o.bu || "all");
  p.set("period", o.period);
  if (o.period === "day" || o.period === "week") p.set("date", o.date);
  if (o.period === "month") {
    p.set("month", String(o.month));
    p.set("year", String(o.year));
  }
  if (o.period === "year") p.set("year", String(o.year));
  p.set("tz", timeZone());

  return api.download(`/export/tickets.pdf?${p.toString()}`, "tickets.pdf");
}

/** What the PDF header will show for a business unit (the same picture or badge the server puts in the PDF). */
export interface LogoPreview {
  unit: string;
  hasImage: boolean;
  /** A data: address with the checked PNG or JPEG, or null when the PDF will show the badge. */
  imageDataUrl: string | null;
  badgeText: string;
  badgeColor: string;
  problem: "NO_LOGO" | "UNSUPPORTED_TYPE" | "UNREADABLE" | null;
}

/** bu = 'all' or a business unit id. */
export function fetchLogoPreview(bu: string) {
  return api.get<LogoPreview>(
    `/export/logo-preview?bu=${encodeURIComponent(bu || "all")}`,
  );
}
