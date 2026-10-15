// Business unit branding: logo, brand color, display text.
//  - the list and every change are ADMIN only
//  - a logo may be viewed by ADMIN (any unit) or by a person of that same unit; otherwise 404
// Mounted at /api/units (login required).
import { Router } from "express";
import multer from "multer";
import { pool, query, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { detectFileType, isLogoType } from "../lib/fileType";
import {
  idParam,
  validateBrandColor,
  validateBrandText,
} from "../lib/validate";
import { FILE_LIMITS } from "../config/constants";
import { requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { sendStoredFile } from "../services/sendFile";
import { removeStored, writeFiles } from "../services/upload";

const router = Router();

// Logos: ONE file, 1 MB at most, read into memory so we can check its real type before saving.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_LIMITS.maxLogoBytes,
    files: 1,
    fields: 5,
    parts: 10,
  },
});

const UNIT_SELECT = `
  SELECT id, code, name, brand_color, brand_text, logo_version, (logo_file IS NOT NULL) AS has_logo
    FROM business_units`;

async function unitRow(db: Db, id: number) {
  const r = await db.query(`${UNIT_SELECT} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

// GET /api/units   (ADMIN) all units with their branding, for the Settings page
router.get(
  "/",
  requireRole("ADMIN"),
  ah(async (_req, res) => {
    const r = await query(`${UNIT_SELECT} ORDER BY name`);
    res.json({ units: r.rows });
  }),
);

// GET /api/units/:id/logo   (ADMIN: any unit. Everyone else: only their own unit)
router.get(
  "/:id/logo",
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    if (user.role !== "ADMIN" && user.business_unit_id !== id)
      throw new HttpError(404, "Not found");

    const r = await query(
      "SELECT logo_file, logo_mime FROM business_units WHERE id = $1",
      [id],
    );
    const row = r.rows[0];
    if (!row || !row.logo_file) throw new HttpError(404, "Not found");

    // The page asks for /logo?v=<version>, so a new logo always gets a new address
    await sendStoredFile(res, {
      storedName: row.logo_file,
      mime: row.logo_mime,
      originalName: "logo",
      cacheSeconds: 3600,
    });
  }),
);

// PATCH /api/units/:id/branding   { brand_color, brand_text }   (ADMIN)
router.patch(
  "/:id/branding",
  requireRole("ADMIN"),
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const color = validateBrandColor(req.body?.brand_color); // #RRGGBB and 4.5:1 contrast with white text
    const text = validateBrandText(req.body?.brand_text); // 2-40 characters, no < or >

    await withTx(async (c) => {
      const r = await c.query(
        "SELECT code, brand_color, brand_text FROM business_units WHERE id = $1 FOR UPDATE",
        [id],
      );
      const cur = r.rows[0];
      if (!cur) throw new HttpError(404, "Not found");

      await c.query(
        "UPDATE business_units SET brand_color = $2, brand_text = $3 WHERE id = $1",
        [id, color, text],
      );
      await audit(c, {
        actorId: actor.id,
        action: "UNIT_BRANDING_CHANGED",
        entityType: "unit",
        entityId: id,
        details: {
          code: cur.code,
          from: { color: cur.brand_color, text: cur.brand_text },
          to: { color, text },
        },
      });
    });

    res.json({ unit: await unitRow(pool, id) });
  }),
);

// POST /api/units/:id/logo   (ADMIN) multipart form, one file in the field "logo"
router.post(
  "/:id/logo",
  requireRole("ADMIN"),
  writeLimiter,
  logoUpload.single("logo"),
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);

    const file = req.file;
    if (!file) throw new HttpError(400, "Please choose a logo file.");

    // The REAL type comes from the file's own bytes. Only PNG, JPG and WebP: never SVG, GIF or PDF.
    const kind = detectFileType(file.buffer);
    if (!isLogoType(kind))
      throw new HttpError(400, "The logo must be a PNG, JPG or WebP picture.");

    await unitRow(pool, id); // 404 for a unit that does not exist, before anything is saved

    const [stored] = await writeFiles([
      {
        buffer: file.buffer,
        originalName: "logo",
        kind,
        size: file.buffer.length,
      },
    ]);

    let oldFile: string | null;
    try {
      oldFile = await withTx(async (c) => {
        const r = await c.query(
          "SELECT code, logo_file FROM business_units WHERE id = $1 FOR UPDATE",
          [id],
        );
        const cur = r.rows[0];
        if (!cur) throw new HttpError(404, "Not found");

        await c.query(
          "UPDATE business_units SET logo_file = $2, logo_mime = $3, logo_version = logo_version + 1 WHERE id = $1",
          [id, stored.storedName, kind.mime],
        );
        await audit(c, {
          actorId: actor.id,
          action: "UNIT_LOGO_CHANGED",
          entityType: "unit",
          entityId: id,
          details: { code: cur.code, mime: kind.mime, size: stored.size },
        });
        return (cur.logo_file as string | null) ?? null;
      });
    } catch (err) {
      await removeStored([stored.storedName]); // do not leave an orphan file behind
      throw err;
    }

    if (oldFile) await removeStored([oldFile]); // only after the new logo is safely saved
    res.json({ unit: await unitRow(pool, id) });
  }),
);

// DELETE /api/units/:id/logo   (ADMIN) back to the colored letter badge
router.delete(
  "/:id/logo",
  requireRole("ADMIN"),
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);

    const oldFile = await withTx(async (c) => {
      const r = await c.query(
        "SELECT code, logo_file FROM business_units WHERE id = $1 FOR UPDATE",
        [id],
      );
      const cur = r.rows[0];
      if (!cur) throw new HttpError(404, "Not found");
      if (!cur.logo_file) return null; // nothing to remove

      await c.query(
        "UPDATE business_units SET logo_file = NULL, logo_mime = NULL, logo_version = logo_version + 1 WHERE id = $1",
        [id],
      );
      await audit(c, {
        actorId: actor.id,
        action: "UNIT_LOGO_REMOVED",
        entityType: "unit",
        entityId: id,
        details: { code: cur.code },
      });
      return cur.logo_file as string;
    });

    if (oldFile) await removeStored([oldFile]);
    res.json({ unit: await unitRow(pool, id) });
  }),
);

export default router;
