// Department management server calls (they match server/src/routes/departments.ts). ADMIN only.
import { api } from "./client";

export interface DepartmentRow {
  id: number;
  name: string;
  is_active: boolean; // false = hidden (not offered in forms)
  users: number; // how many people have it
  created_at: string;
}

type List = { departments: DepartmentRow[] };

export const departmentsApi = {
  list: () => api.get<List>("/departments"),
  create: (name: string) => api.post<List>("/departments", { name }),
  /** Rename and/or hide or show. A rename also updates every person who has the department. */
  update: (id: number, patch: { name?: string; is_active?: boolean }) =>
    api.patch<List>(`/departments/${id}`, patch),
  /** moveTo is required when people have the department. */
  remove: (id: number, moveTo?: number) =>
    api.post<List>(
      `/departments/${id}/delete`,
      moveTo === undefined ? {} : { move_to: moveTo },
    ),
};
