// Runs BEFORE the upload middleware: if the ticket is missing or out of the user's scope,
// stop with 404 right away, so nobody can push big uploads at tickets they cannot see.
import { pool } from "../db/pool";
import { ah } from "../lib/http";
import { idParam } from "../lib/validate";
import { getScopedTicket } from "../security/scope";

export const ticketVisible = ah(async (req, _res, next) => {
  await getScopedTicket(pool, req.user!, idParam(req.params.id));
  next();
});
