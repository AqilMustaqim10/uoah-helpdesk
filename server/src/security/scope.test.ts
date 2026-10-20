// A tiny self-check for the visibility rules. Run with: npm test
// It needs no database and no .env, it just checks the rule functions directly.
import assert from "node:assert/strict";
import type { AuthUser } from "../middleware/auth";
import {
  ticketScope,
  articleScope,
  canWriteArticle,
  canSeeTicketRow,
} from "./scope";

// Make a few pretend users
const base = {
  email: "x@example.com",
  name: "X",
  is_active: true,
  password_changed_at: new Date(),
  branding: null,
  two_factor: false,
};
const admin: AuthUser = { ...base, id: 1, role: "ADMIN", business_unit_id: 6 };
const itFnb: AuthUser = { ...base, id: 2, role: "IT", business_unit_id: 2 };
const itNoUnit: AuthUser = {
  ...base,
  id: 3,
  role: "IT",
  business_unit_id: null,
};
const user: AuthUser = { ...base, id: 4, role: "USER", business_unit_id: 2 };

// ticketScope: admin sees all, IT sees own unit, IT without unit sees nothing, USER sees own tickets
assert.deepEqual(ticketScope(admin, 1), { sql: "TRUE", params: [] });
assert.deepEqual(ticketScope(itFnb, 3), {
  sql: "t.business_unit_id = $3",
  params: [2],
});
assert.deepEqual(ticketScope(itNoUnit, 1), { sql: "FALSE", params: [] });
assert.deepEqual(ticketScope(user, 2, "x"), {
  sql: "x.created_by = $2",
  params: [4],
});

// canSeeTicketRow: same rules applied to a ticket already loaded in memory
assert.equal(
  canSeeTicketRow(itFnb, { created_by: 9, business_unit_id: 2 }),
  true,
); // own unit
assert.equal(
  canSeeTicketRow(itFnb, { created_by: 9, business_unit_id: 3 }),
  false,
); // other unit
assert.equal(
  canSeeTicketRow(user, { created_by: 4, business_unit_id: 3 }),
  true,
); // own ticket
assert.equal(
  canSeeTicketRow(user, { created_by: 5, business_unit_id: 2 }),
  false,
); // someone else's ticket
assert.equal(
  canSeeTicketRow(itNoUnit, { created_by: 5, business_unit_id: 2 }),
  false,
);

// Knowledge base rules
assert.equal(articleScope(admin, 1).sql, "TRUE");
assert.equal(canWriteArticle(itFnb, 2), true); // IT can write in own unit
assert.equal(canWriteArticle(itFnb, 3), false); // but not in another unit
assert.equal(canWriteArticle(itFnb, null), false); // global articles are ADMIN only
assert.equal(canWriteArticle(user, 2), false); // USER can never write
assert.equal(canWriteArticle(admin, null), true);

console.log("scope.test.ts: all checks passed");
