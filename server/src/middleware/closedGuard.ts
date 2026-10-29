// Closed tickets are history: IT staff may look at them (Ticket History) but never change or delete them.
// Only an ADMINISTRATOR can still act on a closed ticket (the only thing left to do is delete it).
// These two guards run BEFORE the ticket and file routes, so IT gets a clear 403 for ANY change to a CLOSED ticket,
// whatever the route or the method (PATCH, POST, PUT, DELETE). Everything else stays exactly as before:
// other units still answer 404, and the rules for open and resolved tickets are unchanged.
import { query } from "../db/pool";
import { ah, HttpError } from "../lib/http";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const MESSAGE =
  "Closed tickets are read-only for IT staff. Only an administrator can change or delete them.";

/** Mounted at /api/tickets: a change to /api/tickets/:id/... of a CLOSED ticket by IT is refused. */
export const itClosedTicketGuard = ah(async (req, _res, next) => {
  if (req.user?.role !== "IT" || SAFE.has(req.method)) return next();

  const m = /^\/(\d{1,15})(?:\/|$)/.exec(req.path); // "/12/status" -> 12 ("/" alone = creating a ticket: not affected)
  if (!m) return next();

  const r = await query("SELECT status FROM tickets WHERE id = $1", [
    Number(m[1]),
  ]);
  if (r.rows[0]?.status === "CLOSED") throw new HttpError(403, MESSAGE);
  next();
});

/** Mounted at /api/files: removing a file of a CLOSED ticket by IT is refused. */
export const itClosedFileGuard = ah(async (req, _res, next) => {
  if (req.user?.role !== "IT" || SAFE.has(req.method)) return next();

  const m = /^\/(\d{1,15})$/.exec(req.path); // "/55" -> file 55
  if (!m) return next();

  const r = await query(
    "SELECT t.status FROM ticket_files f JOIN tickets t ON t.id = f.ticket_id WHERE f.id = $1",
    [Number(m[1])],
  );
  if (r.rows[0]?.status === "CLOSED") throw new HttpError(403, MESSAGE);
  next();
});
