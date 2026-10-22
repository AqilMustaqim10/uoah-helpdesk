// Small helpers for building API routes.
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An error that carries an HTTP status code (e.g. 404 Not found, 400 Bad request). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Express 4 does not catch errors thrown inside async route functions.
 * Wrap every async route in ah(...) so errors reach the error handler instead of crashing.
 */
export const ah =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
