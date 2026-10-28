// Manage the departments (ADMIN only: index.ts mounts this behind requireRole('ADMIN')).
//  - add, rename (also updates every person who has it), hide / show, delete
//  - deleting a department that people have needs a department to move them to
//  - at least one department must always stay visible (or nobody could register)
//  - every change is written to the audit log in the same transaction
import { Router } from "express";
import { pool, query, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { bodyId, cleanText, idParam } from "../lib/validate";
import { writeLimiter } from "../middleware/rateLimit";

const router = Router();

/** Each department with the number of (not deleted) people who have it. */
const LIST_SQL = `
  SELECT d.id, d.name, d.is_active, d.created_at,
         (SELECT count(*)::int FROM users u
           WHERE u.deleted_at IS NULL AND lower(u.department) = lower(d.name)) AS users
    FROM departments d
   ORDER BY lower(d.name)`;

async function listAll(db: Db = pool) {
  const r = await db.query(LIST_SQL);
  return r.rows;
}

/** A department name: 2-60 characters, one line, no < or >. */
function parseName(v: unknown): string {
  const name = cleanText(v, "Name", { min: 2, max: 60 }).replace(/\s+/g, " ");
  if (/[<>]/.test(name))
    throw new HttpError(400, "The name cannot contain < or >.");
  return name;
}

/** 23505 = the unique index: another department already has this name. */
const isDuplicate = (err: unknown) =>
  (err as { code?: string }).code === "23505";
const DUPLICATE = "A department with this name already exists.";

// GET /api/departments
router.get(
  "/",
  ah(async (_req, res) => {
    res.json({ departments: (await query(LIST_SQL)).rows });
  }),
);

// POST /api/departments   { name }
router.post(
  "/",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const name = parseName(req.body?.name);

    try {
      await withTx(async (c) => {
        const ins = await c.query(
          "INSERT INTO departments (name) VALUES ($1) RETURNING id",
          [name],
        );
        await audit(c, {
          actorId: actor.id,
          action: "DEPARTMENT_CREATED",
          entityType: "department",
          entityId: ins.rows[0].id,
          details: { name },
        });
      });
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, DUPLICATE);
      throw err;
    }

    res.status(201).json({ departments: await listAll() });
  }),
);

// PATCH /api/departments/:id   { name?, is_active? }
router.patch(
  "/:id",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const body = req.body ?? {};

    const newName = body.name !== undefined ? parseName(body.name) : null;
    const active = body.is_active;
    if (active !== undefined && typeof active !== "boolean")
      throw new HttpError(400, "is_active must be true or false.");
    if (newName === null && active === undefined)
      throw new HttpError(400, "Nothing to change.");

    try {
      await withTx(async (c) => {
        const r = await c.query(
          "SELECT id, name, is_active FROM departments WHERE id = $1 FOR UPDATE",
          [id],
        );
        const cur = r.rows[0];
        if (!cur) throw new HttpError(404, "Not found");

        // At least one visible department must remain, or nobody could register
        if (active === false && cur.is_active) {
          const others = await c.query(
            "SELECT count(*)::int AS n FROM departments WHERE is_active = TRUE AND id <> $1",
            [id],
          );
          if (others.rows[0].n === 0) {
            throw new HttpError(
              409,
              "At least one department must stay visible, or nobody could register.",
            );
          }
        }

        // Rename: the new name is also written to every person who has the old one
        if (newName !== null && newName !== cur.name) {
          await c.query(
            "UPDATE departments SET name = $2, updated_at = now() WHERE id = $1",
            [id, newName],
          ); // may hit the unique index
          const moved = await c.query(
            "UPDATE users SET department = $2, updated_at = now() WHERE lower(department) = lower($1)",
            [cur.name, newName],
          );
          await audit(c, {
            actorId: actor.id,
            action: "DEPARTMENT_RENAMED",
            entityType: "department",
            entityId: id,
            details: {
              from: cur.name,
              to: newName,
              people: moved.rowCount ?? 0,
            },
          });
        }

        // Hide or show
        if (active !== undefined && active !== cur.is_active) {
          await c.query(
            "UPDATE departments SET is_active = $2, updated_at = now() WHERE id = $1",
            [id, active],
          );
          await audit(c, {
            actorId: actor.id,
            action: active ? "DEPARTMENT_SHOWN" : "DEPARTMENT_HIDDEN",
            entityType: "department",
            entityId: id,
            details: { name: newName ?? cur.name },
          });
        }
      });
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, DUPLICATE);
      throw err;
    }

    res.json({ departments: await listAll() });
  }),
);

// POST /api/departments/:id/delete   { move_to? }
// A department that people have can only be deleted together with moving them to another visible department.
router.post(
  "/:id/delete",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const raw = req.body?.move_to;
    const moveTo =
      raw === undefined || raw === null || raw === ""
        ? null
        : bodyId(raw, "department");

    await withTx(async (c) => {
      const r = await c.query(
        "SELECT id, name, is_active FROM departments WHERE id = $1 FOR UPDATE",
        [id],
      );
      const cur = r.rows[0];
      if (!cur) throw new HttpError(404, "Not found");
      if (moveTo === id)
        throw new HttpError(
          400,
          "Choose a different department to move people to.",
        );

      // At least one visible department must remain
      if (cur.is_active) {
        const others = await c.query(
          "SELECT count(*)::int AS n FROM departments WHERE is_active = TRUE AND id <> $1",
          [id],
        );
        if (others.rows[0].n === 0) {
          throw new HttpError(
            409,
            "At least one department must stay visible, or nobody could register.",
          );
        }
      }

      const counted = await c.query(
        "SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL AND lower(department) = lower($1)",
        [cur.name],
      );
      const people: number = counted.rows[0].n;

      let movedTo: string | null = null;
      if (people > 0) {
        if (moveTo === null) {
          throw new HttpError(
            409,
            `${people} ${people === 1 ? "person has" : "people have"} this department. Choose a department to move them to, or hide it instead.`,
          );
        }
        const t = await c.query(
          "SELECT id, name FROM departments WHERE id = $1 AND is_active = TRUE FOR UPDATE",
          [moveTo],
        );
        if (!t.rows[0])
          throw new HttpError(
            400,
            "The department to move people to must exist and be visible.",
          );
        movedTo = t.rows[0].name as string;
        await c.query(
          "UPDATE users SET department = $2, updated_at = now() WHERE lower(department) = lower($1)",
          [cur.name, movedTo],
        );
      }

      await c.query("DELETE FROM departments WHERE id = $1", [id]);
      await audit(c, {
        actorId: actor.id,
        action: "DEPARTMENT_DELETED",
        entityType: "department",
        entityId: id,
        details: { name: cur.name, people, moved_to: movedTo },
      });
    });

    res.json({ departments: await listAll() });
  }),
);

export default router;
