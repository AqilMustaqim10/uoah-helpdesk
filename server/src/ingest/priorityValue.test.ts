import assert from "node:assert/strict";
import { parsePriority } from "./priorityValue";

assert.equal(parsePriority(" LOW "), "LOW");
assert.equal(parsePriority("medium"), "MEDIUM");
assert.equal(parsePriority("HIGH"), "HIGH");
assert.equal(parsePriority("URGENT"), "URGENT");
assert.throws(() => parsePriority(undefined));
assert.throws(() => parsePriority("MEDIUM, URGENT"));

console.log("priorityValue.test.ts: all checks passed");
