// User Directory (ADMIN only: index.ts mounts this behind requireRole('ADMIN')).
// Rules enforced here, on the server:
//  - you cannot change your own role or disable yourself
//  - the last active ADMIN can never be demoted or disabled
//  - promoting someone to ADMIN (or demoting an ADMIN) needs confirm: true
//  - users are never deleted, only disabled
//  - every change writes an audit row inside the same transaction
import { Router } from "express";
import { pool, query, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { ah, HttpError } from "../lib/http";
import { escapeLike } from "../lib/sql";
import { bodyId, idParam, oneOf } from "../lib/validate";
import { PAGINATION, ROLES } from "../config/constants";
import { writeLimiter } from "../middleware/rateLimit";

const router = Router();

/** A query-string value as clean text ('' when missing or not a string). */
function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** What the directory shows for each person (never the password hash). */
const USER_SELECT = `
  SELECT u.id, u.email, u.name, u.role, u.is_active, u.business_unit_id,
                  bu.code AS unit_code, bu.name AS unit_name, u.created_at,
         (u.totp_enabled_at IS NOT NULL) AS two_factor
    FROM users u
    LEFT JOIN business_units bu ON bu.id = u.business_unit_id`;

async function loadManaged(db: Db, id: number) {
  const r = await db.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

/**
 * Locks every ACTIVE admin (always in id order, so two requests can never deadlock)
 * and returns how many there are. Because the rows are locked, two admins cannot
 * demote each other at the same moment and leave the system with no administrator.
 */
async function lockActiveAdmins(c: Db): Promise<number> {
  const r = await c.query(
    `SELECT id FROM users WHERE role = 'ADMIN' AND is_active = TRUE ORDER BY id FOR UPDATE`,
  );
  return r.rowCount ?? 0;
}

/** Locks one user row for the rest of the transaction. */
async function lockUser(c: Db, id: number) {
  const r = await c.query(
    "SELECT id, email, role, is_active, business_unit_id FROM users WHERE id = $1 FOR UPDATE",
    [id],
  );
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// GET /api/users?q=&role=&status=&unit=&page=
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const conds: string[] = [];
    const params: unknown[] = [];

    const q = qstr(req.query.q).slice(0, 100);
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conds.push(
        `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }

    const role = qstr(req.query.role);
    if (role) {
      params.push(oneOf(role, ROLES, "role"));
      conds.push(`u.role = $${params.length}`);
    }

    const status = qstr(req.query.status);
    if (status === "active") conds.push("u.is_active = TRUE");
    else if (status === "disabled") conds.push("u.is_active = FALSE");
    else if (status) throw new HttpError(400, "Invalid status filter.");

    const unit = qstr(req.query.unit);
    if (unit === "none") {
      conds.push("u.business_unit_id IS NULL");
    } else if (unit) {
      params.push(bodyId(unit, "unit"));
      conds.push(`u.business_unit_id = $${params.length}`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const total: number = (
      await query(`SELECT count(*)::int AS n FROM users u ${where}`, params)
    ).rows[0].n;

    const page = Math.min(
      10000,
      Math.max(1, parseInt(qstr(req.query.page), 10) || 1),
    );
    const pageSize = PAGINATION.defaultPageSize;
    const rows = await query(
      `${USER_SELECT} ${where}
        ORDER BY u.is_active DESC, lower(u.name), u.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    res.json({ users: rows.rows, total, page, pageSize });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/role   { role, confirm? }
// ---------------------------------------------------------------------------
router.patch(
  "/:id/role",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const role = oneOf(req.body?.role, ROLES, "role");
    const confirmed = req.body?.confirm === true;

    await withTx(async (c) => {
      const admins = await lockActiveAdmins(c);
      const target = await lockUser(c, id);

      if (target.id === actor.id)
        throw new HttpError(403, "You cannot change your own role.");
      if (target.role === role) return; // nothing to change

      // Anything that adds or removes administrator power must be confirmed
      if ((target.role === "ADMIN" || role === "ADMIN") && !confirmed) {
        throw new HttpError(400, "Please confirm this change.");
      }
      if (target.role === "ADMIN" && target.is_active && admins <= 1) {
        throw new HttpError(
          409,
          "The last active administrator cannot be changed.",
        );
      }

      await c.query(
        "UPDATE users SET role = $2, updated_at = now() WHERE id = $1",
        [id, role],
      );
      await audit(c, {
        actorId: actor.id,
        action: "USER_ROLE_CHANGED",
        entityType: "user",
        entityId: id,
        details: { email: target.email, from: target.role, to: role },
      });
    });

    res.json({ user: await loadManaged(pool, id) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/unit   { business_unit_id }
// (Existing tickets stay in the unit they were created in.)
// ---------------------------------------------------------------------------
router.patch(
  "/:id/unit",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const unitId = bodyId(req.body?.business_unit_id, "business unit");

    await withTx(async (c) => {
      const target = await lockUser(c, id);

      const unit = await c.query(
        "SELECT id, code FROM business_units WHERE id = $1",
        [unitId],
      );
      if (!unit.rows[0])
        throw new HttpError(400, "Please choose a valid business unit.");
      if (target.business_unit_id === unitId) return; // nothing to change

      let from: string | null = null;
      if (target.business_unit_id) {
        const old = await c.query(
          "SELECT code FROM business_units WHERE id = $1",
          [target.business_unit_id],
        );
        from = old.rows[0]?.code ?? null;
      }

      await c.query(
        "UPDATE users SET business_unit_id = $2, updated_at = now() WHERE id = $1",
        [id, unitId],
      );
      await audit(c, {
        actorId: actor.id,
        action: "USER_UNIT_CHANGED",
        entityType: "user",
        entityId: id,
        details: { email: target.email, from, to: unit.rows[0].code },
      });
    });

    res.json({ user: await loadManaged(pool, id) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/active   { is_active: true | false }
// A disabled person is signed out on their very next request (requireAuth reads is_active every time).
// ---------------------------------------------------------------------------
router.patch(
  "/:id/active",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const active = req.body?.is_active;
    if (typeof active !== "boolean")
      throw new HttpError(400, "is_active must be true or false.");

    await withTx(async (c) => {
      const admins = await lockActiveAdmins(c);
      const target = await lockUser(c, id);

      if (target.id === actor.id && !active)
        throw new HttpError(403, "You cannot disable your own account.");
      if (target.is_active === active) return; // nothing to change
      if (!active && target.role === "ADMIN" && admins <= 1) {
        throw new HttpError(
          409,
          "The last active administrator cannot be disabled.",
        );
      }

      await c.query(
        "UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1",
        [id, active],
      );
      await audit(c, {
        actorId: actor.id,
        action: active ? "USER_ENABLED" : "USER_DISABLED",
        entityType: "user",
        entityId: id,
        details: { email: target.email },
      });
    });

    res.json({ user: await loadManaged(pool, id) });
  }),
);

export default router;
