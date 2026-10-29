// Adds a reply or an internal note to a ticket, optionally with attached files and a linked knowledge base article.
// Accepts JSON (text only) OR multipart form data (text + files). Mounted at /api/tickets.
// A PUBLIC reply is emailed after the commit. Internal notes are never emailed.
// New: linked_kb_id. Only IT/ADMIN may link an article, and only one that is PUBLISHED, visible to the agent,
// and either global or in the ticket's own business unit (so the person who asked can read it too).
import { Router } from "express";
import { pool, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { bodyId, cleanText, idParam } from "../lib/validate";
import { FILE_LIMITS } from "../config/constants";
import { writeLimiter } from "../middleware/rateLimit";
import { ticketVisible } from "../middleware/ticketGuard";
import {
  articleScope,
  canSeeInternal,
  getScopedTicket,
} from "../security/scope";
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

/** The linked article id from the request (a number in JSON, text in a multipart form). null = no link. */
function parseLinkedKb(v: unknown): number | null {
  if (v === undefined || v === null || v === "" || v === "null") return null;
  return bodyId(v, "article"); // 400 for anything that is not a positive whole number
}

// POST /api/tickets/:id/comments   { body, is_internal?, linked_kb_id?, files? }
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
    const linkedKbId = parseLinkedKb(req.body?.linked_kb_id);

    // Only IT/ADMIN may write internal notes or link articles (checked before anything is saved)
    if (internal && !canSeeInternal(user))
      throw new HttpError(403, "Only IT staff can add internal notes.");
    if (linkedKbId !== null && !canSeeInternal(user)) {
      throw new HttpError(
        403,
        "Only IT staff can link knowledge base articles.",
      );
    }

    // Check every file's real type
    const prepared = prepareFiles(
      req.files as Express.Multer.File[] | undefined,
    );

    // A comment needs text. If someone sends only files or only a link, we store a short placeholder line.
    const rawBody = typeof req.body?.body === "string" ? req.body.body : "";
    const body =
      rawBody.trim() === "" && (prepared.length > 0 || linkedKbId !== null)
        ? linkedKbId !== null
          ? "Please see the linked article."
          : "Attached file(s)."
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

        // The article must be one the person who asked can read (published, global or of this ticket's unit)
        // AND one this agent may see. FOR SHARE keeps it from being unpublished while we save the link.
        if (linkedKbId !== null) {
          const scope = articleScope(user, 3, "a");
          const a = await c.query(
            `SELECT a.id
               FROM articles a
              WHERE a.id = $1
                AND a.status = 'PUBLISHED'
                AND (a.business_unit_id IS NULL OR a.business_unit_id = $2)
                AND ${scope.sql}
              FOR SHARE OF a`,
            [linkedKbId, t.business_unit_id, ...scope.params],
          );
          // The same answer whether it does not exist, is a draft, or belongs to another unit
          if (!a.rows[0]) {
            throw new HttpError(
              400,
              "That article cannot be linked to this ticket. Choose a published article of this business unit, or a global one.",
            );
          }
        }

        const ins = await c.query(
          `INSERT INTO comments (ticket_id, author_id, body, is_internal, linked_kb_id, source)
           VALUES ($1, $2, $3, $4, $5, 'WEB') RETURNING id`,
          [id, user.id, body, internal, linkedKbId],
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
          // the text itself is not copied into the audit log
          details: {
            internal,
            files: stored.length,
            ...(linkedKbId !== null ? { kb_id: linkedKbId } : {}),
          },
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

    // The answer includes the linked article's title and excerpt (see buildDetail)
    res.status(201).json(await buildDetail(pool, user, id));
  }),
);

export default router;
