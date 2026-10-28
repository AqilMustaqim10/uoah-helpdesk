// Departments live in the database (table "departments") and are managed by administrators in Settings.
// These two helpers are what the sign-up form, "Add user" and the department change use.
import { pool } from "../db/pool";
import type { Db } from "../db/pool";
import { HttpError } from "../lib/http";

/** The departments people may choose right now (hidden ones are left out), in alphabetical order. */
export async function activeDepartmentNames(db: Db = pool): Promise<string[]> {
  const r = await db.query(
    "SELECT name FROM departments WHERE is_active = TRUE ORDER BY lower(name)",
  );
  return r.rows.map((x) => x.name as string);
}

/**
 * A department from a request. It must be an existing, VISIBLE department.
 * The exact spelling stored in the database is returned, so people never end up with a typo or other capitals.
 */
export async function requireDepartment(
  v: unknown,
  db: Db = pool,
): Promise<string> {
  if (typeof v !== "string" || v.trim() === "" || v.length > 100) {
    throw new HttpError(400, "Please choose your department.");
  }
  const r = await db.query(
    "SELECT name FROM departments WHERE lower(name) = lower($1) AND is_active = TRUE",
    [v.trim()],
  );
  if (!r.rows[0]) throw new HttpError(400, "Please choose your department.");
  return r.rows[0].name as string;
}
