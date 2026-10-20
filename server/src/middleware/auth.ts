// Login protection for the API.
// The cookie holds ONLY the user id. Role, unit, active status and branding
// are read from the DATABASE on every request, so changes take effect immediately.
// New in step H: ADMIN and IT sessions must have passed the second step (two-factor authentication).
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { query } from "../db/pool";
import type { Role } from "../config/constants";

export const COOKIE_NAME = "uoa_session";
const SESSION_HOURS = 8;

/** The short "second step pending" cookie. It is only sent to /api/auth/2fa/... and lives 5 minutes. */
export const MFA_COOKIE = "uoa_mfa";
const MFA_COOKIE_PATH = "/api/auth/2fa";
const MFA_MINUTES = 5;

/** Branding of the user's business unit (logo, color, text). */
export interface Branding {
  unitId: number;
  code: string;
  name: string;
  brandColor: string;
  brandText: string;
  logoVersion: number;
  hasLogo: boolean;
}

/** The logged-in user, freshly loaded from the database. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  business_unit_id: number | null;
  password_changed_at: Date;
  two_factor: boolean; // is two-factor authentication turned on for this person?
  branding: Branding | null;
}

// Lets route code write req.user with the correct type.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Cookie safety: JavaScript in the page cannot read it (httpOnly),
// and it is only sent over HTTPS in production (secure).
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProd,
  path: "/",
};

/**
 * Creates the login cookie (valid 8 hours). It contains only the user id.
 * mfa = true means "this person also passed the two-factor step". ADMIN and IT sessions need it.
 */
export function setAuthCookie(
  res: Response,
  userId: number,
  mfa = false,
): void {
  const token = jwt.sign(mfa ? { mfa: true } : {}, config.jwtSecret, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: SESSION_HOURS * 3600 * 1000,
  });
}

/** Removes the login cookie (logout). */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

/** After a correct password, when a second step is still needed: a 5-minute cookie that is NOT a session. */
export function setMfaChallengeCookie(res: Response, userId: number): void {
  const token = jwt.sign({ purpose: "mfa" }, config.jwtSecret, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: `${MFA_MINUTES}m`,
  });
  res.cookie(MFA_COOKIE, token, {
    ...cookieOptions,
    path: MFA_COOKIE_PATH,
    maxAge: MFA_MINUTES * 60 * 1000,
  });
}

export function clearMfaChallengeCookie(res: Response): void {
  res.clearCookie(MFA_COOKIE, { ...cookieOptions, path: MFA_COOKIE_PATH });
}

/** Reads the second-step cookie. Returns null if it is missing, expired, forged, or not a second-step token. */
export function readMfaChallenge(
  req: Request,
): { userId: number; iat: number } | null {
  const token = req.cookies?.[MFA_COOKIE];
  if (typeof token !== "string" || !token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    });
    if (
      typeof decoded === "string" ||
      decoded.purpose !== "mfa" ||
      typeof decoded.iat !== "number"
    )
      return null;
    const userId = Number(decoded.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
    return { userId, iat: decoded.iat };
  } catch {
    return null;
  }
}

/** Loads a user plus their unit branding from the database. Returns null if not found. */
export async function loadUserById(id: number): Promise<AuthUser | null> {
  const r = await query(
    `SELECT u.id, u.email, u.name, u.role, u.is_active, u.business_unit_id, u.password_changed_at,
            (u.totp_enabled_at IS NOT NULL) AS two_factor,
            b.id AS b_id, b.code AS b_code, b.name AS b_name, b.brand_color, b.brand_text,
            b.logo_version, (b.logo_file IS NOT NULL) AS has_logo
       FROM users u
       LEFT JOIN business_units b ON b.id = u.business_unit_id
      WHERE u.id = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    is_active: row.is_active,
    business_unit_id: row.business_unit_id,
    password_changed_at: row.password_changed_at,
    two_factor: row.two_factor,
    branding: row.b_id
      ? {
          unitId: row.b_id,
          code: row.b_code,
          name: row.b_name,
          brandColor: row.brand_color,
          brandText: row.brand_text,
          logoVersion: row.logo_version,
          hasLogo: row.has_logo,
        }
      : null,
  };
}

/** Sends "please sign in" (401) and clears any bad cookie. */
function reject(res: Response) {
  clearAuthCookie(res);
  res.status(401).json({ error: "Please sign in." });
}

/**
 * Put this before any route that needs a logged-in user.
 * It rejects: missing/invalid/expired cookies, unknown or disabled users,
 * sessions issued BEFORE the last password change, second-step cookies used as sessions,
 * and ADMIN / IT sessions that did not pass two-factor authentication.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token !== "string" || !token) return reject(res);

    // 1) Verify the cookie signature and expiry (only HS256 is accepted)
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ["HS256"],
      });
      if (typeof decoded === "string") return reject(res);
      payload = decoded;
    } catch {
      return reject(res);
    }

    // A second-step token is never a session
    if (payload.purpose !== undefined) return reject(res);

    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof payload.iat !== "number")
      return reject(res);

    // 2) Load the user from the database (never trust the cookie for role or unit)
    const user = await loadUserById(id);
    if (!user || !user.is_active) return reject(res);

    // 3) Password changed after this cookie was issued? Then this session is dead.
    if (Math.floor(user.password_changed_at.getTime() / 1000) > payload.iat)
      return reject(res);

    // 4) ADMIN and IT must have passed the second step. (This also catches someone who was promoted
    //    while signed in, and every session that existed before two-factor authentication was added.)
    if ((user.role === "ADMIN" || user.role === "IT") && payload.mfa !== true)
      return reject(res);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Use after requireAuth: only the listed roles may continue.
 * Others get 404 so hidden admin routes do not even reveal that they exist.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  };
}
