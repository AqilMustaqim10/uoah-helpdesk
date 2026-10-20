// The sign-in related server calls (they match server/src/routes/auth.ts and mfa.ts).
import { api } from "./client";
import type { UnitOption, User } from "../types";

interface Ok {
  ok: boolean;
  message?: string;
}

/** Signed in, or "the password was right but a second step is needed". */
export type LoginResult = { user: User } | { mfa: "verify" | "setup" };

export const authApi = {
  me: () => api.get<{ user: User }>("/auth/me"),
  login: (email: string, password: string) =>
    api.post<LoginResult>("/auth/login", { email, password }),
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

  // ----- two-factor authentication -----
  /** A 6-digit code or a recovery code. recoveryLeft is set only when a recovery code was used. */
  mfaVerify: (code: string) =>
    api.post<{ user: User; recoveryLeft: number | null }>("/auth/2fa/verify", {
      code,
    }),
  mfaSetupStart: () =>
    api.post<{ secret: string; uri: string; qr: string }>(
      "/auth/2fa/setup/start",
    ),
  mfaSetupConfirm: (code: string) =>
    api.post<{ user: User; recoveryCodes: string[] }>(
      "/auth/2fa/setup/confirm",
      { code },
    ),
  mfaStatus: () =>
    api.get<{ enabled: boolean; recoveryCodesLeft: number }>(
      "/auth/2fa/status",
    ),
  mfaRegenerate: (code: string) =>
    api.post<{ recoveryCodes: string[] }>("/auth/2fa/recovery/regenerate", {
      code,
    }),
};
