// The sign-in related server calls (they match server/src/routes/auth.ts).
import { api } from "./client";
import type { UnitOption, User } from "../types";

interface Ok {
  ok: boolean;
  message?: string;
}

export const authApi = {
  me: () => api.get<{ user: User }>("/auth/me"),
  login: (email: string, password: string) =>
    api.post<{ user: User }>("/auth/login", { email, password }),
  logout: () => api.post<Ok>("/auth/logout"),
  units: () => api.get<{ units: UnitOption[] }>("/auth/units"),

  signupRequest: (body: {
    email: string;
    name: string;
    password: string;
    business_unit_id: number;
  }) => api.post<Ok>("/auth/signup/request", body),
  signupVerify: (email: string, code: string) =>
    api.post<{ user: User }>("/auth/signup/verify", { email, code }),

  forgotRequest: (email: string) =>
    api.post<Ok>("/auth/forgot/request", { email }),
  forgotReset: (email: string, code: string, new_password: string) =>
    api.post<Ok>("/auth/forgot/reset", { email, code, new_password }),
};
