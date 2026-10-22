// POST /api/tickets/:id/files : attach pictures/PDFs to the ticket itself.
// Mounted at /api/tickets (login required).
import { Router } from "express";
import { pool, withTx } from "../db/pool";
import { ah, HttpError } from "../lib/http";
import { idParam } from "../lib/validate";
import { FILE_LIMITS } from "../config/constants";
import { writeLimiter } from "../middleware/rateLimit";
import { ticketVisible } from "../middleware/ticketGuard";
import { getScopedTicket } from "../security/scope";
import {
  ensureRoomForTicketFiles,
  insertTicketFiles,
} from "../services/attachments";
import { buildDetail } from "../services/ticketQueries";
import {
  prepareFiles,
  removeStored,
  upload,
  writeFiles,
} from "../services/upload";

const router = Router();

router.post(
  "/:id/files",
  writeLimiter,
  ticketVisible, // 404 first if the ticket is not yours to see
  upload.array("files", FILE_LIMITS.maxFilesPerItem),
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    // 1) Check every file's real type (400 if any is not allowed)
    const prepared = prepareFiles(
      req.files as Express.Multer.File[] | undefined,
    );
    if (prepared.length === 0)
      throw new HttpError(400, "Please choose at least one file.");

    // 2) Save to disk, then record in the database. If the database step fails, remove the files again.
    const stored = await writeFiles(prepared);
    try {
      await withTx(async (c) => {
        const t = await getScopedTicket(c, user, id, true); // locks the ticket row
        if (t.status === "CLOSED")
          throw new HttpError(
            409,
            "This ticket is closed and cannot be changed.",
          );

        await ensureRoomForTicketFiles(c, id, stored.length);
        await insertTicketFiles(c, {
          actorId: user.id,
          ticketId: id,
          commentId: null,
          files: stored,
        });
        await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1", [
          id,
        ]);
      });
    } catch (err) {
      await removeStored(stored.map((s) => s.storedName));
      throw err;
    }

    res.status(201).json(await buildDetail(pool, user, id));
  }),
);

export default router;
