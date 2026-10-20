// User Directory server calls (they match server/src/routes/users.ts and usersMfa.ts).
import { api } from "./client";
import type { ManagedUser, Role, UserListResponse, UserQuery } from "../types";

function toQueryString(q: UserQuery): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.role) p.set("role", q.role);
  if (q.status) p.set("status", q.status);
  if (q.unit) p.set("unit", q.unit);
  p.set("page", String(q.page));
  return p.toString();
}

export const usersApi = {
  list: (q: UserQuery) =>
    api.get<UserListResponse>(`/users?${toQueryString(q)}`),
  /** confirm = true is required when promoting someone to ADMIN or demoting an ADMIN. */
  setRole: (id: number, role: Role, confirm: boolean) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/role`, { role, confirm }),
  setUnit: (id: number, business_unit_id: number) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/unit`, { business_unit_id }),
  setActive: (id: number, is_active: boolean) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/active`, { is_active }),
  /** Removes someone's authenticator and recovery codes (they sign in again and set it up anew). */
  reset2fa: (id: number) => api.post<{ ok: boolean }>(`/users/${id}/reset-2fa`),
};
