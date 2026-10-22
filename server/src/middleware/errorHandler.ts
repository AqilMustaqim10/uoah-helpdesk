// The last stop for every error. Turns errors into clean JSON answers
// and never leaks technical details (stack traces, SQL) to the browser.
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Errors we threw on purpose (404, 400, ...) carry a safe message.
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Errors raised by the upload library (multer)
  const code = (err as { code?: string })?.code;
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File is too large." });
    return;
  }
  if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "Too many files." });
    return;
  }

  // Broken JSON sent by the browser
  if ((err as { type?: string })?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON." });
    return;
  }

  // Anything else is a bug: log the details on the server, send a vague message to the user.
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong." });
}
