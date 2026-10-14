// Extra protection against "cross-site request forgery":
// a request that changes data must come from our own web app (or from a tool with no Origin header,
// like PowerShell/curl, which is fine because browsers always send Origin on such requests).
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env";

export function originCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Reading data is always allowed
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
    return next();

  const origin = req.headers.origin;
  if (origin && origin !== config.clientOrigin) {
    res.status(403).json({ error: "Request blocked." });
    return;
  }
  next();
}
