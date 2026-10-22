// Permanently erases a ticket. Mounted at /api/tickets (login required).
//  - only IT and ADMIN, and only tickets they may see (IT: their own unit; anything else is "not found")
//  - a reason of at least 5 characters is required
//  - the ticket, its replies, its attachment rows and its attachment FILES are erased; the link from
//    an imported email to the ticket is removed (the email itself stays marked as handled, so it is not imported again)
//  - the append-only audit log keeps its older rows and gets one TICKET_DELETED entry with the reason
import { Router } from "express";
import { withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { ticketRef } from "../lib/sql";
import { cleanText, idParam } from "../lib/validate";
import { writeLimiter } from "../middleware/rateLimit";
import { canSeeInternal, getScopedTicket } from "../security/scope";
import { removeStored } from "../services/upload";

const router = Router();

// POST /api/tickets/:id/delete   { reason }
router.post(
  "/:id/delete",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const reason = cleanText(req.body?.reason, "Reason", {
      min: 5,
      max: 500,
      multiline: true,
    });

    const storedNames = await withTx(async (c) => {
      // 404 first if the ticket is out of scope. The row is locked, so nobody can add a reply or a file
      // to it while it is being erased (their insert waits, then finds no ticket).
      const t = await getScopedTicket(c, user, id, true);
      if (!canSeeInternal(user))
        throw new HttpError(403, "Only IT staff can delete tickets.");

      const files = await c.query(
        "SELECT stored_name FROM ticket_files WHERE ticket_id = $1",
        [id],
      );
      const replies = await c.query(
        "SELECT count(*)::int AS n FROM comments WHERE ticket_id = $1",
        [id],
      );

      // Order matters: files point to replies, replies and files point to the ticket
      await c.query("DELETE FROM ticket_files WHERE ticket_id = $1", [id]);
      await c.query("DELETE FROM comments WHERE ticket_id = $1", [id]);
      await c.query(
        "UPDATE processed_messages SET ticket_id = NULL WHERE ticket_id = $1",
        [id],
      );
      await c.query("DELETE FROM tickets WHERE id = $1", [id]);

      await audit(c, {
        actorId: user.id,
        action: "TICKET_DELETED",
        entityType: "ticket",
        entityId: id,
        ticketId: id,
        details: {
          ref: ticketRef(id),
          title: String(t.title).slice(0, 200),
          requester_email: t.requester_email,
          business_unit_id: t.business_unit_id,
          status: t.status,
          priority: t.priority,
          comments: replies.rows[0].n,
          files: files.rows.length,
          reason,
        },
      });
      return files.rows.map((r) => r.stored_name as string);
    });

    // Only after the database change is saved are the files removed from disk (best effort)
    await removeStored(storedNames);
    res.json({ ok: true });
  }),
);

export default router;
