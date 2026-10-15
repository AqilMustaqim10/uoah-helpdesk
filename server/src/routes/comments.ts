// Adds a reply or an internal note to a ticket. Also mounted at /api/tickets.
import { Router } from "express";
import { pool, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { cleanText, idParam } from "../lib/validate";
import { writeLimiter } from "../middleware/rateLimit";
import { canSeeInternal, getScopedTicket } from "../security/scope";
import { buildDetail } from "../services/ticketQueries";

const router = Router();

// POST /api/tickets/:id/comments   { body, is_internal? }
router.post(
  "/:id/comments",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const body = cleanText(req.body?.body, "Comment", {
      min: 1,
      max: 10000,
      multiline: true,
    });
    const internal = req.body?.is_internal === true;

    await withTx(async (c) => {
      // 404 first if the ticket is out of scope; the row is locked so a close can't race us
      const t = await getScopedTicket(c, user, id, true);

      // Only IT/ADMIN may write internal notes
      if (internal && !canSeeInternal(user))
        throw new HttpError(403, "Only IT staff can add internal notes.");
      // Closed tickets are read-only
      if (t.status === "CLOSED")
        throw new HttpError(
          409,
          "This ticket is closed and cannot be changed.",
        );

      const ins = await c.query(
        `INSERT INTO comments (ticket_id, author_id, body, is_internal, source)
         VALUES ($1, $2, $3, $4, 'WEB') RETURNING id`,
        [id, user.id, body, internal],
      );
      await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1", [
        id,
      ]);
      await audit(c, {
        actorId: user.id,
        action: "COMMENT_ADDED",
        entityType: "comment",
        entityId: ins.rows[0].id,
        ticketId: id,
        details: { internal }, // the text itself is not copied into the audit log
      });
    });

    // Phase 6: public replies are emailed (to the requester if IT replied, to the assignee if the
    // requester replied). Internal notes are NEVER emailed. Sent after commit, never blocking.
    res.status(201).json(await buildDetail(pool, user, id));
  }),
);

export default router;
