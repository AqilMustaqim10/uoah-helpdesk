// Branding server calls (they match server/src/routes/units.ts).
import { api } from "./client";
import type { UnitBranding } from "../types";

export const unitsApi = {
  list: () => api.get<{ units: UnitBranding[] }>("/units"),
  saveBranding: (id: number, brand_color: string, brand_text: string) =>
    api.patch<{ unit: UnitBranding }>(`/units/${id}/branding`, {
      brand_color,
      brand_text,
    }),
  uploadLogo: (id: number, file: File) => {
    const form = new FormData();
    form.append("logo", file); // the field name must be "logo"
    return api.post<{ unit: UnitBranding }>(`/units/${id}/logo`, form);
  },
  removeLogo: (id: number) =>
    api.del<{ unit: UnitBranding }>(`/units/${id}/logo`),
};
