// Download and remove an attachment. Mounted at /api/files (login required).
//  - a file is only served to someone who may see its ticket (otherwise 404)
//  - files on INTERNAL notes are invisible to a USER
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Router } from "express";
import { pool, query, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { idParam } from "../lib/validate";
import { canSeeInternal, ticketScope } from "../security/scope";
import { buildDetail } from "../services/ticketQueries";
import { removeStored, storedPath } from "../services/upload";

const router = Router();

/** Builds a safe Content-Disposition header (works for names with spaces and non-English letters). */
function contentDisposition(
  name: string,
  kind: "inline" | "attachment",
): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\;]/g, "_");
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// ---------------------------------------------------------------------------
// GET /api/files/:id           (add ?download=1 to force a download)
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const scope = ticketScope(user, 2, "t");
    const staff = canSeeInternal(user);

    const r = await query(
      `SELECT f.original_name, f.stored_name, f.mime
         FROM ticket_files f
         JOIN tickets t ON t.id = f.ticket_id
         LEFT JOIN comments c ON c.id = f.comment_id
        WHERE f.id = $1 AND ${scope.sql}
          ${staff ? "" : "AND (c.id IS NULL OR c.is_internal = FALSE)"}`,
      [id, ...scope.params],
    );
    const f = r.rows[0];
    if (!f) throw new HttpError(404, "Not found");

    const filePath = storedPath(f.stored_name);
    let size: number;
    try {
      size = (await fs.stat(filePath)).size;
    } catch {
      throw new HttpError(404, "Not found"); // the row exists but the file is gone from disk
    }

    // The type comes from the DATABASE (detected from the file's bytes when it was uploaded)
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Content-Length", String(size));
    res.setHeader("X-Content-Type-Options", "nosniff"); // the browser must not guess another type
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader(
      "Content-Disposition",
      contentDisposition(
        f.original_name,
        req.query.download === "1" ? "attachment" : "inline",
      ),
    );

    const stream = createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/files/:id
// Allowed: the person who uploaded it, or IT/ADMIN. Never on a closed ticket.
// ---------------------------------------------------------------------------
router.delete(
  "/:id",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const staff = canSeeInternal(user);

    const removed = await withTx(async (c) => {
      const scope = ticketScope(user, 2, "t");
      const r = await c.query(
        `SELECT f.id, f.ticket_id, f.uploaded_by, f.original_name, f.stored_name, f.comment_id, t.status
           FROM ticket_files f
           JOIN tickets t ON t.id = f.ticket_id
           LEFT JOIN comments c ON c.id = f.comment_id
          WHERE f.id = $1 AND ${scope.sql}
            ${staff ? "" : "AND (c.id IS NULL OR c.is_internal = FALSE)"}
          FOR UPDATE OF f, t`,
        [id, ...scope.params],
      );
      const f = r.rows[0];
      if (!f) throw new HttpError(404, "Not found");

      if (f.status === "CLOSED")
        throw new HttpError(
          409,
          "This ticket is closed and cannot be changed.",
        );
      if (!staff && f.uploaded_by !== user.id)
        throw new HttpError(403, "You can only remove your own files.");

      await c.query("DELETE FROM ticket_files WHERE id = $1", [id]);
      await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1", [
        f.ticket_id,
      ]);
      await audit(c, {
        actorId: user.id,
        action: "FILE_REMOVED",
        entityType: "file",
        entityId: id,
        ticketId: f.ticket_id,
        details: { name: f.original_name, comment_id: f.comment_id },
      });
      return {
        ticketId: f.ticket_id as number,
        storedName: f.stored_name as string,
      };
    });

    // Only after the database change is saved do we delete the file from disk
    await removeStored([removed.storedName]);
    res.json(await buildDetail(pool, user, removed.ticketId));
  }),
);

export default router;
