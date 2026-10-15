// Knowledge base: articles with tags, status and attachments. Mounted at /api/kb (login required).
//  - what you can SEE comes from articleScope() (out of scope = 404)
//  - what you can WRITE comes from canWriteArticle() (visible but read-only = 403)
//  - IT writes only in their own unit, ADMIN anywhere (including "global"), USER reads published only
//  - articles are never deleted; use status ARCHIVED
import { Router } from "express";
import { pool, query, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { bodyId, cleanText, idParam, oneOf } from "../lib/validate";
import { escapeLike } from "../lib/sql";
import { ARTICLE_STATUSES, FILE_LIMITS, PAGINATION } from "../config/constants";
import type { AuthUser } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { articleScope, canWriteArticle } from "../security/scope";
import { sendStoredFile } from "../services/sendFile";
import {
  prepareFiles,
  removeStored,
  upload,
  writeFiles,
} from "../services/upload";

const router = Router();

function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Columns shared by the list and the detail view. */
const ARTICLE_COLUMNS = `
  a.id, a.title, a.status, a.tags, a.business_unit_id,
  bu.code AS unit_code, bu.name AS unit_name,
  a.created_by, cu.name AS author_name, a.updated_by, uu.name AS editor_name,
  a.created_at, a.updated_at`;

const ARTICLE_JOINS = `
  LEFT JOIN business_units bu ON bu.id = a.business_unit_id
  JOIN users cu ON cu.id = a.created_by
  JOIN users uu ON uu.id = a.updated_by`;

/** Tags: a list (or comma-separated text). Lowercased, de-duplicated, max 10, each up to 30 characters. */
function parseTags(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  const list = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(",")
      : null;
  if (!list) throw new HttpError(400, "Invalid tags.");

  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") throw new HttpError(400, "Invalid tags.");
    const tag = raw
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > 30)
      throw new HttpError(400, "Each tag can have at most 30 characters.");
    if (/[<>]/.test(tag))
      throw new HttpError(400, "Tags cannot contain < or >.");
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > 10)
    throw new HttpError(400, "An article can have at most 10 tags.");
  return out;
}

/** A unit id from the request. null / '' means "global" (all units). Checks the unit exists. */
async function parseUnit(db: Db, v: unknown): Promise<number | null> {
  if (v === null || v === "") return null;
  const id = bodyId(v, "business unit");
  const r = await db.query("SELECT 1 FROM business_units WHERE id = $1", [id]);
  if (!r.rows[0])
    throw new HttpError(400, "Please choose a valid business unit.");
  return id;
}

/** One article + its files, only if the user may see it (otherwise 404). */
async function buildArticleDetail(db: Db, user: AuthUser, id: number) {
  const scope = articleScope(user, 2, "a");
  const r = await db.query(
    `SELECT ${ARTICLE_COLUMNS}, a.body
       FROM articles a ${ARTICLE_JOINS}
      WHERE a.id = $1 AND ${scope.sql}`,
    [id, ...scope.params],
  );
  const row = r.rows[0];
  if (!row) throw new HttpError(404, "Not found");

  const files = await db.query(
    `SELECT f.id, f.original_name, f.mime, f.size_bytes, f.created_at, f.uploaded_by, u.name AS uploader_name
       FROM article_files f
       JOIN users u ON u.id = f.uploaded_by
      WHERE f.article_id = $1
      ORDER BY f.id`,
    [id],
  );

  return {
    article: { ...row, can_edit: canWriteArticle(user, row.business_unit_id) },
    files: files.rows,
  };
}

/** Runs BEFORE the upload middleware: 404 if the article is not visible, 403 if it is read-only for you. */
const articleWritable = ah(async (req, _res, next) => {
  const user = req.user!;
  const id = idParam(req.params.id);
  const scope = articleScope(user, 2, "a");
  const r = await query(
    `SELECT a.business_unit_id FROM articles a WHERE a.id = $1 AND ${scope.sql}`,
    [id, ...scope.params],
  );
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  if (!canWriteArticle(user, r.rows[0].business_unit_id))
    throw new HttpError(403, "You cannot change this article.");
  next();
});

// ---------------------------------------------------------------------------
// GET /api/kb/files/:fileId   (add ?download=1 to force a download)
// ---------------------------------------------------------------------------
router.get(
  "/files/:fileId",
  ah(async (req, res) => {
    const user = req.user!;
    const fileId = idParam(req.params.fileId);
    const scope = articleScope(user, 2, "a");

    const r = await query(
      `SELECT f.original_name, f.stored_name, f.mime
         FROM article_files f
         JOIN articles a ON a.id = f.article_id
        WHERE f.id = $1 AND ${scope.sql}`,
      [fileId, ...scope.params],
    );
    const f = r.rows[0];
    if (!f) throw new HttpError(404, "Not found");

    await sendStoredFile(res, {
      storedName: f.stored_name,
      mime: f.mime,
      originalName: f.original_name,
      download: req.query.download === "1",
    });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/kb/files/:fileId
// ---------------------------------------------------------------------------
router.delete(
  "/files/:fileId",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const fileId = idParam(req.params.fileId);

    const removed = await withTx(async (c) => {
      const scope = articleScope(user, 2, "a");
      const r = await c.query(
        `SELECT f.id, f.article_id, f.original_name, f.stored_name, a.business_unit_id
           FROM article_files f
           JOIN articles a ON a.id = f.article_id
          WHERE f.id = $1 AND ${scope.sql}
          FOR UPDATE OF f`,
        [fileId, ...scope.params],
      );
      const f = r.rows[0];
      if (!f) throw new HttpError(404, "Not found");
      if (!canWriteArticle(user, f.business_unit_id))
        throw new HttpError(403, "You cannot change this article.");

      await c.query("DELETE FROM article_files WHERE id = $1", [fileId]);
      await c.query("UPDATE articles SET updated_at = now() WHERE id = $1", [
        f.article_id,
      ]);
      await audit(c, {
        actorId: user.id,
        action: "ARTICLE_FILE_REMOVED",
        entityType: "article",
        entityId: f.article_id,
        details: { name: f.original_name },
      });
      return {
        articleId: f.article_id as number,
        storedName: f.stored_name as string,
      };
    });

    await removeStored([removed.storedName]); // only after the database change is saved
    res.json(await buildArticleDetail(pool, user, removed.articleId));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/kb?q=&status=&unit=&page=
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;

    // 1) Visibility: ALWAYS first, always from articleScope
    const scope = articleScope(user, 1, "a");
    const conds: string[] = [scope.sql];
    const params: unknown[] = [...scope.params];

    // 2) Optional filters
    const status = qstr(req.query.status);
    if (status) {
      params.push(oneOf(status, ARTICLE_STATUSES, "status"));
      conds.push(`a.status = $${params.length}`);
    }

    const unit = qstr(req.query.unit);
    if (unit === "global") {
      conds.push("a.business_unit_id IS NULL");
    } else if (unit) {
      params.push(bodyId(unit, "unit"));
      conds.push(`a.business_unit_id = $${params.length}`);
    }

    const q = qstr(req.query.q).slice(0, 100);
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      const n = params.length;
      conds.push(
        `(a.title ILIKE $${n} OR a.body ILIKE $${n} OR EXISTS (SELECT 1 FROM unnest(a.tags) AS tg WHERE tg ILIKE $${n}))`,
      );
    }

    const where = conds.join(" AND ");
    const total: number = (
      await query(
        `SELECT count(*)::int AS n FROM articles a WHERE ${where}`,
        params,
      )
    ).rows[0].n;

    const page = Math.min(
      10000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const pageSize = PAGINATION.defaultPageSize;
    const rows = await query(
      `SELECT ${ARTICLE_COLUMNS}, left(a.body, 200) AS excerpt
         FROM articles a ${ARTICLE_JOINS}
        WHERE ${where}
        ORDER BY a.updated_at DESC, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    res.json({ articles: rows.rows, total, page, pageSize });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/kb   { title, body, status?, tags?, business_unit_id? }
// ---------------------------------------------------------------------------
router.post(
  "/",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    if (user.role === "USER")
      throw new HttpError(403, "Only IT staff can write articles.");

    const title = cleanText(req.body?.title, "Title", { min: 3, max: 200 });
    const body = cleanText(req.body?.body, "Article text", {
      min: 1,
      max: 50000,
      multiline: true,
    });
    const status =
      req.body?.status === undefined
        ? "DRAFT"
        : oneOf(req.body.status, ARTICLE_STATUSES, "status");
    const tags = parseTags(req.body?.tags);

    // IT articles go to the IT person's own unit. ADMIN chooses (empty = global, for all units).
    const unitId =
      req.body?.business_unit_id === undefined
        ? user.role === "IT"
          ? user.business_unit_id
          : null
        : await parseUnit(pool, req.body.business_unit_id);

    if (!canWriteArticle(user, unitId)) {
      throw new HttpError(
        403,
        "You can only write articles for your own business unit.",
      );
    }

    const id = await withTx(async (c) => {
      const ins = await c.query(
        `INSERT INTO articles (title, body, status, tags, business_unit_id, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
        [title, body, status, tags, unitId, user.id],
      );
      const articleId: number = ins.rows[0].id;
      await audit(c, {
        actorId: user.id,
        action: "ARTICLE_CREATED",
        entityType: "article",
        entityId: articleId,
        details: { title, status, business_unit_id: unitId },
      });
      return articleId;
    });

    res.status(201).json(await buildArticleDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/kb/:id
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  ah(async (req, res) => {
    res.json(await buildArticleDetail(pool, req.user!, idParam(req.params.id)));
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/kb/:id   any of { title, body, status, tags, business_unit_id }
// ---------------------------------------------------------------------------
router.patch(
  "/:id",
  writeLimiter,
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);
    const b = req.body ?? {};

    await withTx(async (c) => {
      const scope = articleScope(user, 2, "a");
      const r = await c.query(
        `SELECT a.id, a.status, a.business_unit_id
           FROM articles a
          WHERE a.id = $1 AND ${scope.sql}
          FOR UPDATE OF a`,
        [id, ...scope.params],
      );
      const cur = r.rows[0];
      if (!cur) throw new HttpError(404, "Not found");
      if (!canWriteArticle(user, cur.business_unit_id))
        throw new HttpError(403, "You cannot change this article.");

      // Build the UPDATE only from the fields that were sent (column names come from this code, never from users)
      const vals: unknown[] = [id];
      const sets: string[] = [];
      const changed: string[] = [];
      const set = (column: string, value: unknown, field: string) => {
        vals.push(value);
        sets.push(`${column} = $${vals.length}`);
        changed.push(field);
      };

      if (b.title !== undefined)
        set(
          "title",
          cleanText(b.title, "Title", { min: 3, max: 200 }),
          "title",
        );
      if (b.body !== undefined) {
        set(
          "body",
          cleanText(b.body, "Article text", {
            min: 1,
            max: 50000,
            multiline: true,
          }),
          "body",
        );
      }
      if (b.status !== undefined)
        set("status", oneOf(b.status, ARTICLE_STATUSES, "status"), "status");
      if (b.tags !== undefined) set("tags", parseTags(b.tags), "tags");
      if (b.business_unit_id !== undefined) {
        const unit = await parseUnit(c, b.business_unit_id);
        // IT cannot move an article to another unit or make it global
        if (!canWriteArticle(user, unit))
          throw new HttpError(403, "You cannot move this article there.");
        set("business_unit_id", unit, "unit");
      }

      if (sets.length === 0) throw new HttpError(400, "Nothing to change.");

      vals.push(user.id);
      sets.push(`updated_by = $${vals.length}`);
      await c.query(
        `UPDATE articles SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
        vals,
      );

      await audit(c, {
        actorId: user.id,
        action: "ARTICLE_UPDATED",
        entityType: "article",
        entityId: id,
        details: {
          fields: changed,
          ...(b.status !== undefined && b.status !== cur.status
            ? { status_from: cur.status, status_to: b.status }
            : {}),
        },
      });
    });

    res.json(await buildArticleDetail(pool, user, id));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/kb/:id/files   (pictures and PDFs; multipart field "files")
// ---------------------------------------------------------------------------
router.post(
  "/:id/files",
  writeLimiter,
  articleWritable, // 404 / 403 first, before any upload is read
  upload.array("files", FILE_LIMITS.maxFilesPerItem),
  ah(async (req, res) => {
    const user = req.user!;
    const id = idParam(req.params.id);

    // Real type from the file's bytes (400 if any file is not allowed)
    const prepared = prepareFiles(
      req.files as Express.Multer.File[] | undefined,
    );
    if (prepared.length === 0)
      throw new HttpError(400, "Please choose at least one file.");

    const stored = await writeFiles(prepared);
    try {
      await withTx(async (c) => {
        const scope = articleScope(user, 2, "a");
        const r = await c.query(
          `SELECT a.business_unit_id FROM articles a WHERE a.id = $1 AND ${scope.sql} FOR UPDATE OF a`,
          [id, ...scope.params],
        );
        if (!r.rows[0]) throw new HttpError(404, "Not found");
        if (!canWriteArticle(user, r.rows[0].business_unit_id))
          throw new HttpError(403, "You cannot change this article.");

        const count = await c.query(
          "SELECT count(*)::int AS n FROM article_files WHERE article_id = $1",
          [id],
        );
        if (count.rows[0].n + stored.length > FILE_LIMITS.maxFilesPerItem) {
          throw new HttpError(
            400,
            `An article can have at most ${FILE_LIMITS.maxFilesPerItem} attachments.`,
          );
        }

        for (const f of stored) {
          await c.query(
            `INSERT INTO article_files (article_id, uploaded_by, original_name, stored_name, mime, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, user.id, f.originalName, f.storedName, f.kind.mime, f.size],
          );
          await audit(c, {
            actorId: user.id,
            action: "ARTICLE_FILE_ADDED",
            entityType: "article",
            entityId: id,
            details: { name: f.originalName, mime: f.kind.mime, size: f.size },
          });
        }
        await c.query("UPDATE articles SET updated_at = now() WHERE id = $1", [
          id,
        ]);
      });
    } catch (err) {
      await removeStored(stored.map((s) => s.storedName)); // do not leave orphan files behind
      throw err;
    }

    res.status(201).json(await buildArticleDetail(pool, user, id));
  }),
);

export default router;
