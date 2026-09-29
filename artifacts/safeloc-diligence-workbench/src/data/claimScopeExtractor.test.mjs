import assert from "node:assert/strict";
import test from "node:test";

import { extractClaimScopeFromPassage } from "./claimScopeExtractor.mjs";

test("separates a full-campus capacity claim from the phase sentence and ignores an unrelated date", () => {
  const scope = extractClaimScopeFromPassage({
    claimPassage: "Red Oak campus has a total capacity of 480 MW across all phases. Phase One, comprising DFW9, DFW10, and DFW11, has 180 MW across three buildings. The project is expected to open in 2028.",
    claimValue: 480,
    unit: "MW",
  });
  assert.deepEqual(scope, {
    facilityScope: "project",
    phaseScope: "all-phases",
    claimTimePeriod: null,
    phaseIdentity: null,
  });
});

test("preserves phase name, building identifiers, and building count for the matching value", () => {
  const scope = extractClaimScopeFromPassage({
    claimPassage: "Red Oak campus totals 480 MW. Phase One, comprising DFW9, DFW10, and DFW11, has 180 MW across three buildings.",
    claimValue: 180,
    unit: "MW",
  });
  assert.equal(scope.facilityScope, "project");
  assert.equal(scope.phaseScope, "exact-phase");
  assert.match(scope.phaseIdentity, /Phase One/i);
  assert.match(scope.phaseIdentity, /DFW9\/DFW10\/DFW11/);
  assert.match(scope.phaseIdentity, /3 buildings/);
  assert.equal(scope.claimTimePeriod, null);
});

test("does not borrow an adjacent date unless the next sentence refers to the same claim", () => {
  const unrelatedDate = extractClaimScopeFromPassage({
    claimPassage: "The Red Oak campus has 480 MW of total capacity. The project is expected to open in 2028.",
    claimValue: 480,
    unit: "MW",
  });
  assert.equal(unrelatedDate.claimTimePeriod, null);

  const explicitlyRelatedDate = extractClaimScopeFromPassage({
    claimPassage: "The Red Oak campus has 480 MW of total capacity. This capacity is stated as of 2026.",
    claimValue: 480,
    unit: "MW",
  });
  assert.equal(explicitlyRelatedDate.claimTimePeriod, "2026");
});

test("keeps a construction-phase identity separate from the claim period", () => {
  const scope = extractClaimScopeFromPassage({
    claimPassage: "The 365-day interconnection timeline applies to its 2026 construction phase.",
    claimValue: 365,
    unit: "days",
  });
  assert.equal(scope.phaseScope, "exact-phase");
  assert.equal(scope.phaseIdentity, "2026 construction phase");
  assert.equal(scope.claimTimePeriod, null);
});

test("keeps scope unknown when the passage has no scope language or the value is ambiguous", () => {
  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage: "The filing reports 180 MW. It expects construction to begin in 2028.",
    claimValue: 180,
    unit: "MW",
  }), {
    facilityScope: "unknown",
    phaseScope: "unknown",
    claimTimePeriod: null,
    phaseIdentity: null,
  });
  assert.equal(extractClaimScopeFromPassage({
    claimPassage: "The project has 180 MW. A separate facility also has 180 MW.",
    claimValue: 180,
    unit: "MW",
  }).phaseScope, "unknown");
});