// Adds a reply or an internal note to a ticket, optionally with attached files.
// Accepts JSON (text only) OR multipart form data (text + files). Mounted at /api/tickets.
// New in step E: a PUBLIC reply is emailed after the commit. Internal notes are never emailed.
import { Router } from "express";
import { pool, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { cleanText, idParam } from "../lib/validate";
import { FILE_LIMITS } from "../config/constants";
import { writeLimiter } from "../middleware/rateLimit";
import { ticketVisible } from "../middleware/ticketGuard";
import { canSeeInternal, getScopedTicket } from "../security/scope";
import { insertTicketFiles } from "../services/attachments";
import { notifyReply } from "../services/notify";
import { buildDetail } from "../services/ticketQueries";
import {
  prepareFiles,
  removeStored,
  upload,
  writeFiles,
} from "../services/upload";

const router = Router();

// POST /api/tickets/:id/comments   { body, is_internal?, files? }
router.post(
  "/:id/comments",
  writeLimiter,
  ticketVisible, // 404 first if the ticket is not yours to see
  upload.array("files", FILE_LIMITS.maxFilesPerItem), // does nothing for plain JSON requests
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    // In a multipart form every value is text, so "true" arrives as the string 'true'
    const internal =
      req.body?.is_internal === true || req.body?.is_internal === "true";

    // Only IT/ADMIN may write internal notes (checked before anything is saved)
    if (internal && !canSeeInternal(user))
      throw new HttpError(403, "Only IT staff can add internal notes.");

    // Check every file's real type
    const prepared = prepareFiles(
      req.files as Express.Multer.File[] | undefined,
    );

    // A comment needs text. If someone sends only files, we store a short placeholder line.
    const rawBody = typeof req.body?.body === "string" ? req.body.body : "";
    const body =
      rawBody.trim() === "" && prepared.length > 0
        ? "Attached file(s)."
        : cleanText(rawBody, "Comment", {
            min: 1,
            max: 10000,
            multiline: true,
          });

    const stored = await writeFiles(prepared);
    let newCommentId: number;
    try {
      newCommentId = await withTx(async (c) => {
        // Row lock: a ticket being closed at the same moment cannot slip a comment in
        const t = await getScopedTicket(c, user, id, true);
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
        const commentId: number = ins.rows[0].id;
        await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1", [
          id,
        ]);
        await audit(c, {
          actorId: user.id,
          action: "COMMENT_ADDED",
          entityType: "comment",
          entityId: commentId,
          ticketId: id,
          details: { internal, files: stored.length }, // the text itself is not copied into the audit log
        });
        await insertTicketFiles(c, {
          actorId: user.id,
          ticketId: id,
          commentId,
          files: stored,
        });
        return commentId;
      });
    } catch (err) {
      await removeStored(stored.map((s) => s.storedName)); // do not leave orphan files behind
      throw err;
    }

    // Public replies are emailed (to the requester if IT replied, to the assignee if the requester
    // replied). Internal notes are NEVER emailed. Sent after the commit, in the background.
    if (!internal) notifyReply(id, newCommentId, user.id);

    res.status(201).json(await buildDetail(pool, user, id));
  }),
);

export default router;
