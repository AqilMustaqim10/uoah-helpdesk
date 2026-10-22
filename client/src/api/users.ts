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

/** What the "Add user" window sends. IT leaves out business_unit_id and role (the server fixes them). */
export interface NewUserInput {
  email: string;
  name: string;
  department: string;
  business_unit_id?: number;
  role?: Role;
  /** Required by the server when role is ADMIN. */
  confirm?: boolean;
}

export const usersApi = {
  list: (q: UserQuery) =>
    api.get<UserListResponse>(`/users?${toQueryString(q)}`),
  /** Creates an account and emails the person an invitation (ADMIN: any unit and role; IT: own unit, USER only). */
  create: (body: NewUserInput) =>
    api.post<{ user: ManagedUser }>("/users", body),
  /** confirm = true is required when promoting someone to ADMIN or demoting an ADMIN. */
  setRole: (id: number, role: Role, confirm: boolean) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/role`, { role, confirm }),
  setUnit: (id: number, business_unit_id: number) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/unit`, { business_unit_id }),
  setDepartment: (id: number, department: string) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/department`, { department }),
  setActive: (id: number, is_active: boolean) =>
    api.patch<{ user: ManagedUser }>(`/users/${id}/active`, { is_active }),
  /** Removes someone's authenticator and recovery codes (they sign in again and set it up anew). */
  reset2fa: (id: number) => api.post<{ ok: boolean }>(`/users/${id}/reset-2fa`),
  /** PERMANENT. A reason of at least 5 characters is required. */
  erase: (id: number, reason: string) =>
    api.post<{ ok: boolean }>(`/users/${id}/delete`, { reason }),
};
