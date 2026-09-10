import test from "node:test";
import assert from "node:assert/strict";
import { stableLineageFingerprint } from "./financialLineage";

test("lineage fingerprints are deterministic across object key ordering", () => {
  assert.equal(
    stableLineageFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    stableLineageFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("lineage fingerprints change when accepted inputs change", () => {
  assert.notEqual(
    stableLineageFingerprint({ classifications: { electricity_cost: "User Assumption" } }),
    stableLineageFingerprint({ classifications: { electricity_cost: "Verified Evidence" } }),
  );
});