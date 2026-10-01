import assert from "node:assert/strict";
import test from "node:test";
import { boundedCooldownUntil, getStoredCooldownUntil, storeCooldownUntil } from "./clientCooldown";

test("public retry cooldowns are finite and bounded without starting requests", () => {
  assert.equal(boundedCooldownUntil(12, 1_000), 13_000);
  assert.equal(boundedCooldownUntil(99_999, 1_000), 301_000);
  assert.equal(boundedCooldownUntil(null, 1_000), null);
  assert.equal(boundedCooldownUntil(Number.NaN, 1_000), null);
  assert.equal(boundedCooldownUntil(-1, 1_000), null);
});

test("unavailable browser storage does not prevent public review or recovery", () => {
  assert.equal(getStoredCooldownUntil("offline-cooldown"), null);
  assert.doesNotThrow(() => storeCooldownUntil("offline-cooldown", Date.now() + 1_000));
});