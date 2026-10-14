// Shared TypeScript shapes. They match what the server sends back.

export type Role = "ADMIN" | "IT" | "USER";

/** Business unit branding (logo, color, text). */
export interface Branding {
  unitId: number;
  code: string;
  name: string;
  brandColor: string;
  brandText: string;
  logoVersion: number;
  hasLogo: boolean;
}

/** The logged-in user as sent by /api/auth/me. */
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  business_unit_id: number | null;
  branding: Branding | null;
}

/** A business unit in the sign-up dropdown. */
export interface UnitOption {
  id: number;
  code: string;
  name: string;
}

/** The sidebar tabs. */
export type TabKey = "dashboard" | "tickets" | "kb" | "users" | "settings";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
