// The dashboard server call (matches server/src/routes/stats.ts).
import { api } from "./client";
import type { DashboardStats } from "../types";

/** One day of the trend chart. day looks like 2026-10-16. */
export interface TrendPoint {
  day: string;
  created: number;
  resolved: number;
}

export type DashboardData = DashboardStats & { trend: TrendPoint[] };

export const dashboardApi = {
  stats: () => {
    // The server needs to know YOUR time zone, to decide which day a ticket belongs to
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* keep UTC */
    }
    return api.get<DashboardData>(`/stats?tz=${encodeURIComponent(tz)}`);
  },
};
