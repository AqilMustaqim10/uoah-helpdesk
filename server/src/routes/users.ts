// User Directory. Mounted at /api/users for ADMIN and IT (index.ts).
//   ADMIN: sees everyone, creates users in any unit, changes roles / units / departments,
//          enables / disables, and deletes accounts.
//   IT:    sees only the normal user accounts of THEIR OWN business unit, may create normal user accounts
//          in that unit, and may delete them. Everything else is ADMIN only.
// Rules enforced here, on the server:
//  - you cannot change, disable or delete your own account
//  - the last active ADMIN can never be demoted, disabled or deleted
//  - promoting someone to ADMIN (or demoting an ADMIN, or creating an ADMIN) needs confirm: true
//  - "delete" is PERMANENT: a reason is required, the person is anonymized, and a short record
//    (with the reason) goes into the append-only audit log in the same transaction
import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool, query, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { audit } from "../db/audit";
import { PAGINATION, ROLES, type Role } from "../config/constants";
import { requireDepartment } from "../services/departments";
import { ah, HttpError } from "../lib/http";
import { escapeLike } from "../lib/sql";
import {
  bodyId,
  cleanText,
  idParam,
  isAllowedDomain,
  normEmail,
  oneOf,
} from "../lib/validate";
import { requireRole } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { sendInvitationEmail } from "../services/inviteMail";

const router = Router();

/** A query-string value as clean text ('' when missing or not a string). */
function qstr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** What the directory shows for each person (never the password hash). */
const USER_SELECT = `
  SELECT u.id, u.email, u.name, u.role, u.is_active, u.business_unit_id, u.department,
         bu.code AS unit_code, bu.name AS unit_name, u.created_at,
         (u.totp_enabled_at IS NOT NULL) AS two_factor
    FROM users u
    LEFT JOIN business_units bu ON bu.id = u.business_unit_id`;

async function loadManaged(db: Db, id: number) {
  const r = await db.query(
    `${USER_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id],
  );
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

/**
 * Locks every ACTIVE admin (always in id order, so two requests can never deadlock)
 * and returns how many there are. Because the rows are locked, two admins cannot
 * demote, disable or delete each other at the same moment and leave the system with no administrator.
 */
async function lockActiveAdmins(c: Db): Promise<number> {
  const r = await c.query(
    `SELECT id FROM users WHERE role = 'ADMIN' AND is_active = TRUE AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
  );
  return r.rowCount ?? 0;
}

/** Locks one (not deleted) user row for the rest of the transaction. */
async function lockUser(c: Db, id: number) {
  const r = await c.query(
    "SELECT id, email, role, is_active, business_unit_id, department FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    [id],
  );
  if (!r.rows[0]) throw new HttpError(404, "Not found");
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// GET /api/users?q=&role=&status=&unit=&page=
// ADMIN: everyone (with filters). IT: only normal user accounts of their own unit.
// ---------------------------------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const me = req.user!;
    const isAdmin = me.role === "ADMIN";
    const conds: string[] = ["u.deleted_at IS NULL"];
    const params: unknown[] = [];

    // Who may be seen (this is the visibility rule for the directory)
    if (!isAdmin) {
      if (me.business_unit_id == null) {
        conds.push("FALSE"); // IT with no unit sees nobody
      } else {
        params.push(me.business_unit_id);
        conds.push(`u.role = 'USER'`, `u.business_unit_id = $${params.length}`);
      }
    }

    const q = qstr(req.query.q).slice(0, 100);
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conds.push(
        `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }

    // These filters only exist for ADMIN (IT is already limited to one unit and one role)
    if (isAdmin) {
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
    }

    const where = `WHERE ${conds.join(" AND ")}`;
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
// POST /api/users   { email, name, department, business_unit_id?, role?, confirm? }   create an account
//  ADMIN: any unit, any role (an ADMIN account needs confirm: true).
//  IT:    ONLY their own unit and ONLY the USER role.
// The account gets a random password that nobody knows; the person receives an invitation email and
// chooses their own password with "Forgot password".
// ---------------------------------------------------------------------------
router.post(
  "/",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const email = normEmail(req.body?.email);
    const name = cleanText(req.body?.name, "Name", { max: 100 });
    const department = await requireDepartment(req.body?.department);
    if (!isAllowedDomain(email)) {
      throw new HttpError(
        400,
        "Only company email addresses (the allowed domains) can be added.",
      );
    }

    // Which unit and which role? (the rule differs for ADMIN and IT)
    let role: Role = "USER";
    let unitId: number;
    if (actor.role === "ADMIN") {
      unitId = bodyId(req.body?.business_unit_id, "business unit");
      if (req.body?.role !== undefined)
        role = oneOf(req.body.role, ROLES, "role");
      if (role === "ADMIN" && req.body?.confirm !== true)
        throw new HttpError(400, "Please confirm this change.");
    } else {
      if (actor.business_unit_id == null) {
        throw new HttpError(
          403,
          "Your account has no business unit, so you cannot add users.",
        );
      }
      if (req.body?.role !== undefined && req.body.role !== "USER") {
        throw new HttpError(
          403,
          "IT staff can only create normal user accounts.",
        );
      }
      const sent = req.body?.business_unit_id;
      if (
        sent !== undefined &&
        sent !== null &&
        sent !== "" &&
        Number(sent) !== actor.business_unit_id
      ) {
        throw new HttpError(
          403,
          "You can only create users in your own business unit.",
        );
      }
      unitId = actor.business_unit_id;
    }

    // A random password that nobody ever sees (the person sets their own through "Forgot password")
    const passwordHash = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      12,
    );

    let newId: number;
    try {
      newId = await withTx(async (c) => {
        const unit = await c.query(
          "SELECT id FROM business_units WHERE id = $1",
          [unitId],
        );
        if (!unit.rows[0])
          throw new HttpError(400, "Please choose a valid business unit.");

        const ins = await c.query(
          `INSERT INTO users (email, name, password_hash, role, business_unit_id, department)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [email, name, passwordHash, role, unitId, department],
        );
        await audit(c, {
          actorId: actor.id,
          action: "USER_CREATED",
          entityType: "user",
          entityId: ins.rows[0].id,
          details: { email, role, business_unit_id: unitId, department },
        });
        return ins.rows[0].id as number;
      });
    } catch (err) {
      // 23505 = an account with this email already exists
      if ((err as { code?: string }).code === "23505") {
        throw new HttpError(
          409,
          "An account with this email address already exists.",
        );
      }
      throw err;
    }

    // After the commit, in the background: the invitation (a mail problem never undoes the account)
    sendInvitationEmail({ to: email, name, createdBy: actor.name, role });

    res.status(201).json({ user: await loadManaged(pool, newId) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/role   { role, confirm? }   (ADMIN only)
// ---------------------------------------------------------------------------
router.patch(
  "/:id/role",
  requireRole("ADMIN"),
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
// PATCH /api/users/:id/unit   { business_unit_id }   (ADMIN only)
// (Existing tickets stay in the unit they were created in.)
// ---------------------------------------------------------------------------
router.patch(
  "/:id/unit",
  requireRole("ADMIN"),
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
// PATCH /api/users/:id/department   { department }   (ADMIN only)
// Lets an administrator set or correct a person's department (everyone created before step I has none).
// ---------------------------------------------------------------------------
router.patch(
  "/:id/department",
  requireRole("ADMIN"),
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const department = await requireDepartment(req.body?.department);

    await withTx(async (c) => {
      const target = await lockUser(c, id);
      if (target.department === department) return; // nothing to change

      await c.query(
        "UPDATE users SET department = $2, updated_at = now() WHERE id = $1",
        [id, department],
      );
      await audit(c, {
        actorId: actor.id,
        action: "USER_DEPARTMENT_CHANGED",
        entityType: "user",
        entityId: id,
        details: {
          email: target.email,
          from: target.department ?? null,
          to: department,
        },
      });
    });

    res.json({ user: await loadManaged(pool, id) });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/active   { is_active: true | false }   (ADMIN only)
// A disabled person is signed out on their very next request (requireAuth reads is_active every time).
// ---------------------------------------------------------------------------
router.patch(
  "/:id/active",
  requireRole("ADMIN"),
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

// ---------------------------------------------------------------------------
// POST /api/users/:id/delete   { reason }   PERMANENT. A reason of at least 5 characters is required.
//  ADMIN: anyone except themselves and the last active administrator.
//  IT:    only normal user accounts of THEIR OWN unit (anything else looks like "not found").
// What happens to the person:
//  - name -> "Deleted user", email -> deleted-<id>@deleted.invalid (so the address can register again),
//    department, password and two-factor data are cleared, all sessions end
//  - their tickets stay, but the requester email and the original email text on them are cleared
//  - their open tickets are unassigned
//  - ONE audit entry keeps the original email and name, and the reason
// ---------------------------------------------------------------------------
router.post(
  "/:id/delete",
  writeLimiter,
  ah(async (req, res) => {
    const actor = req.user!;
    const id = idParam(req.params.id);
    const reason = cleanText(req.body?.reason, "Reason", {
      min: 5,
      max: 500,
      multiline: true,
    });

    // A password that nobody can ever use, and the placeholder address (computed before the transaction)
    const lockedHash = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      12,
    );
    const placeholder = `deleted-${id}@deleted.invalid`;
    const isAdmin = actor.role === "ADMIN";

    await withTx(async (c) => {
      const admins = isAdmin ? await lockActiveAdmins(c) : 0;

      // IT only finds people in their own unit (a person elsewhere, or a missing one, is simply "not found")
      const found = await c.query(
        `SELECT id, email, name, role, is_active, business_unit_id, department
           FROM users
          WHERE id = $1 AND deleted_at IS NULL ${isAdmin ? "" : "AND business_unit_id = $2"}
          FOR UPDATE`,
        isAdmin ? [id] : [id, actor.business_unit_id],
      );
      const target = found.rows[0];
      if (!target) throw new HttpError(404, "Not found");

      if (target.id === actor.id)
        throw new HttpError(403, "You cannot delete your own account.");
      if (!isAdmin && target.role !== "USER")
        throw new HttpError(
          403,
          "IT staff can only delete normal user accounts.",
        );
      if (target.role === "ADMIN" && target.is_active && admins <= 1) {
        throw new HttpError(
          409,
          "The last active administrator cannot be deleted.",
        );
      }

      // Open work is handed back to the queue; finished (closed) tickets keep their history
      const unassigned = await c.query(
        `UPDATE tickets SET assigned_to = NULL, updated_at = now() WHERE assigned_to = $1 AND status <> 'CLOSED'`,
        [id],
      );
      // Their tickets stay, but no longer carry their email address or the original email text
      const theirTickets = await c.query(
        "UPDATE tickets SET requester_email = $2, raw_body = NULL WHERE created_by = $1",
        [id, placeholder],
      );
      await c.query(
        "UPDATE comments SET raw_body = NULL WHERE author_id = $1",
        [id],
      );
      await c.query("DELETE FROM recovery_codes WHERE user_id = $1", [id]);
      await c.query("DELETE FROM email_codes WHERE email = $1", [target.email]); // no pending code for the freed address

      await c.query(
        `UPDATE users
            SET email = $2, name = 'Deleted user', department = NULL, password_hash = $3,
                is_active = FALSE, deleted_at = now(),
                totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
                mfa_failed_count = 0, mfa_locked_until = NULL,
                password_changed_at = now(), updated_at = now()
          WHERE id = $1`,
        [id, placeholder, lockedHash],
      );

      await audit(c, {
        actorId: actor.id,
        action: "USER_DELETED",
        entityType: "user",
        entityId: id,
        details: {
          email: target.email,
          name: target.name,
          role: target.role,
          business_unit_id: target.business_unit_id,
          department: target.department ?? null,
          tickets_anonymized: theirTickets.rowCount ?? 0,
          tickets_unassigned: unassigned.rowCount ?? 0,
          reason,
        },
      });
    });

    res.json({ ok: true });
  }),
);

export default router;
