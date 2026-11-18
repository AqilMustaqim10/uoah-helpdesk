// Business-unit dashboard announcements.
// IT can manage only its own unit; ADMIN can manage every unit.
import { Router } from "express";
import { query, withTx } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { idParam, optionalText } from "../lib/validate";
import { requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";

const router = Router();

function canManage(user: NonNullable<Express.Request["user"]>, unitId: number) {
  return user.role === "ADMIN" || (user.role === "IT" && user.business_unit_id === unitId);
}

// The signed-in dashboard uses this. Administrators without a BU simply have no notice.
router.get(
  "/current",
  ah(async (req, res) => {
    const unitId = req.user!.business_unit_id;
    if (!unitId) return res.json({ announcement: null });
    const result = await query(
      `SELECT announcement_text, announcement_updated_at
         FROM business_units
        WHERE id = $1 AND announcement_text IS NOT NULL`,
      [unitId],
    );
    const row = result.rows[0];
    res.json({
      announcement: row
        ? { text: row.announcement_text, updated_at: row.announcement_updated_at }
        : null,
    });
  }),
);

// The announcement editor gets only the units this staff member may manage.
router.get(
  "/",
  requireRole("ADMIN", "IT"),
  ah(async (req, res) => {
    const user = req.user!;
    if (user.role === "IT" && !user.business_unit_id) return res.json({ units: [] });
    const params = user.role === "IT" ? [user.business_unit_id] : [];
    const where = user.role === "IT" ? "WHERE id = $1" : "";
    const result = await query(
      `SELECT id, code, name, announcement_text, announcement_updated_at
         FROM business_units ${where} ORDER BY name`,
      params,
    );
    res.json({ units: result.rows });
  }),
);

// Send announcement_text as a string to publish/update, or null/empty to clear it.
router.patch(
  "/:id",
  requireRole("ADMIN", "IT"),
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    if (!canManage(actor, id)) throw new HttpError(404, "Not found");
    const text = optionalText(req.body?.announcement_text, "Announcement", {
      max: 1000,
      multiline: true,
    });

    const unit = await withTx(async (db) => {
      const current = await db.query(
        "SELECT code, announcement_text FROM business_units WHERE id = $1 FOR UPDATE",
        [id],
      );
      const row = current.rows[0];
      if (!row) throw new HttpError(404, "Not found");

      const changed = (row.announcement_text ?? null) !== text;
      const updated = await db.query(
        `UPDATE business_units
            SET announcement_text = $2,
                announcement_updated_at = CASE WHEN $3 THEN now() ELSE announcement_updated_at END
          WHERE id = $1
          RETURNING id, code, name, announcement_text, announcement_updated_at`,
        [id, text, changed],
      );
      if (changed) {
        await audit(db, {
          actorId: actor.id,
          action: text ? "UNIT_ANNOUNCEMENT_SET" : "UNIT_ANNOUNCEMENT_CLEARED",
          entityType: "unit",
          entityId: id,
          details: { code: row.code },
        });
      }
      return updated.rows[0];
    });
    res.json({ unit });
  }),
);

export default router;
