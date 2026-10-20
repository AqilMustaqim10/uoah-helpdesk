// What the browser is allowed to know about the logged-in user (never the password hash or any secret).
import type { AuthUser } from "../middleware/auth";

export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    business_unit_id: u.business_unit_id,
    branding: u.branding,
    two_factor: u.two_factor,
  };
}
