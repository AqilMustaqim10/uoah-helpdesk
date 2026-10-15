// Limits how often one IP address can call sensitive endpoints (stops guessing attacks).
import rateLimit from "express-rate-limit";

const FIFTEEN_MIN = 15 * 60 * 1000;

/**
 * Login: max 10 FAILED attempts per 15 minutes per IP.
 * Successful logins are not counted, so many staff behind one office internet address
 * can't lock each other out.
 */
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

/** Asking for a code (sign up / forgot password): max 10 per 15 minutes per IP. */
export const codeRequestLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a few minutes." },
});

/** Entering a code: max 20 per 15 minutes per IP (each code also has its own 5-try limit). */
export const codeVerifyLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

/** A gentle overall limit for the whole API: 300 requests per minute per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

/**
 * Creating tickets and comments: max 100 per 15 minutes PER LOGGED-IN USER
 * (not per IP, so colleagues behind one office address don't share a limit).
 */
export const writeLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user-${req.user?.id ?? "anon"}`,
  message: {
    error: "You are doing that too often. Please wait a few minutes.",
  },
});
