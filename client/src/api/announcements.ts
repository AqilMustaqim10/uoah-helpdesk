import { api } from "./client";
import type { UnitAnnouncement } from "../types";

export interface CurrentAnnouncement {
  text: string;
  updated_at: string;
}

export const announcementsApi = {
  current: () => api.get<{ announcement: CurrentAnnouncement | null }>("/announcements/current"),
  list: () => api.get<{ units: UnitAnnouncement[] }>("/announcements"),
  save: (id: number, announcement_text: string | null) =>
    api.patch<{ unit: UnitAnnouncement }>(`/announcements/${id}`, { announcement_text }),
};
