// Search the knowledge base for an article to LINK in a ticket reply. IT and ADMIN only (index.ts).
//   GET /api/kb/search?ticket=<ticket id>&query=<words>
// Only articles that may really be linked to THAT ticket are returned:
//   - PUBLISHED (the person who asked for help must be able to read it)
//   - global, or belonging to the ticket's own business unit
//   - and visible to the agent who is searching (articleScope)
// The ticket itself must be one the agent may see (otherwise 404, like everywhere else).
import { Router } from "express";
import { pool, query } from "../db/pool";
import { ah } from "../lib/http";
import { escapeLike } from "../lib/sql";
import { idParam } from "../lib/validate";
import { articleScope, getScopedTicket } from "../security/scope";

const router = Router();

const MAX_RESULTS = 8;

/** A query-string value as clean text ('' when missing or not a string). */
const qstr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;

    // 404 when the ticket is missing or out of the agent's scope
    const ticket = await getScopedTicket(
      pool,
      user,
      idParam(qstr(req.query.ticket)),
    );

    // $1 = the ticket's unit; the visibility rule of the agent comes next ($2, ...)
    const scope = articleScope(user, 2, "a");
    const params: unknown[] = [ticket.business_unit_id, ...scope.params];

    // No words: the newest articles. With words: title, text or tag, title matches first.
    let match = "TRUE";
    let order = "a.updated_at DESC, a.id DESC";
    const text = qstr(req.query.query ?? req.query.q).slice(0, 100);
    if (text) {
      params.push(`%${escapeLike(text)}%`);
      const n = params.length;
      // Only OUR code builds this text; the words travel as a parameter
      const inTags = `EXISTS (SELECT 1 FROM unnest(a.tags) AS tg WHERE tg ILIKE $${n})`;
      match = `(a.title ILIKE $${n} OR a.body ILIKE $${n} OR ${inTags})`;
      order = `(CASE WHEN a.title ILIKE $${n} THEN 0 WHEN ${inTags} THEN 1 ELSE 2 END), a.updated_at DESC, a.id DESC`;
    }

    const r = await query(
      `SELECT a.id, a.title, left(a.body, 160) AS excerpt, a.tags, bu.code AS unit_code, a.updated_at
         FROM articles a
         LEFT JOIN business_units bu ON bu.id = a.business_unit_id
        WHERE a.status = 'PUBLISHED'
          AND (a.business_unit_id IS NULL OR a.business_unit_id = $1)
          AND ${scope.sql}
          AND ${match}
        ORDER BY ${order}
        LIMIT ${MAX_RESULTS}`,
      params,
    );

    res.json({ articles: r.rows });
  }),
);

export default router;
