// The dashboard server call (matches server/src/routes/stats.ts).
import { api } from "./client";
import type { DashboardStats } from "../types";

export const dashboardApi = {
  stats: () => api.get<DashboardStats>("/stats"),
};
