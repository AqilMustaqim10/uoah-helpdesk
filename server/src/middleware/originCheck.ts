// Extra protection against "cross-site request forgery":
// a request that changes data must come from our own web app (or from a tool with no Origin header,
// like PowerShell/curl, which is fine because browsers always send Origin on such requests).
// When a request is blocked, the reason is printed in the API window, so a wrong address is easy to find.
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env";

// Configured origins have trailing slashes removed in env.ts.
const ALLOWED = config.clientOrigins;

export function originCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Reading data is always allowed
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
    return next();

  const origin = req.headers.origin;
  if (origin && !ALLOWED.includes(origin)) {
    console.warn(
      `[origin] blocked ${req.method} ${req.originalUrl}: the page was opened at ${JSON.stringify(origin)} ` +
        `but CLIENT_ORIGIN in server/.env allows ${JSON.stringify(ALLOWED)}`,
    );
    res.status(403).json({ error: "Request blocked." });
    return;
  }
  next();
}
