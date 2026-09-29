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

test("binds the complete Red Oak passage's capacity and phase claims to their own sentences", () => {
  const claimPassage = "DataBank's Red Oak campus is planned for a full-build capacity of 480 MW of critical IT load across eight buildings. In a disclosure dated April 21, 2026, Phase One at the project comprises DFW9, DFW10, and DFW11 and includes 180 megawatts of power across three buildings. The campus is expected to begin operating in 2028.";

  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage,
    claimValue: 480,
    unit: "MW",
  }), {
    facilityScope: "project",
    phaseScope: "all-phases",
    claimTimePeriod: null,
    phaseIdentity: null,
  });

  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage,
    claimValue: "180 megawatts",
    unit: "MW",
  }), {
    facilityScope: "project",
    phaseScope: "exact-phase",
    claimTimePeriod: "2026-04-21",
    phaseIdentity: "Phase One; DFW9/DFW10/DFW11; 3 buildings",
  });

  const operatingYear = extractClaimScopeFromPassage({
    claimPassage,
    claimValue: 2028,
    unit: "year",
  });
  assert.equal(operatingYear.phaseIdentity, null);
  assert.equal(operatingYear.claimTimePeriod, null);
});

test("classifies the literal Red Oak building-group and eventual full-build claims", () => {
  const claimPassage = "The DataBank Red Oak data center campus is a 292-acre, eight-building hyperscale development located 20 miles south of Dallas in Red Oak, Texas. On April 21, 2026, DataBank closed a $2 billion construction loan, the largest in company history, to fund the first three buildings (DFW9, DFW10, and DFW11), which together total 600,000 square feet and 180 megawatts of power. The 292-acre site will eventually host eight buildings delivering 480 MW of total IT load.";

  const fullBuild = extractClaimScopeFromPassage({
    claimPassage,
    claimValue: 480,
    unit: "MW",
  });
  assert.deepEqual(fullBuild, {
    facilityScope: "project",
    phaseScope: "all-phases",
    claimTimePeriod: null,
    phaseIdentity: null,
  });
  assert.doesNotMatch(JSON.stringify(fullBuild), /DFW9|DFW10|DFW11/);

  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage,
    claimValue: "180 megawatts",
    unit: "MW",
  }), {
    facilityScope: "project",
    phaseScope: "exact-phase",
    claimTimePeriod: "2026-04-21",
    phaseIdentity: "first 3 buildings; DFW9/DFW10/DFW11; 3 buildings",
  });

  const firstThreeBuildings = extractClaimScopeFromPassage({
    claimPassage: "The Red Oak campus will initially serve the first three buildings with 180 MW of power.",
    claimValue: 180,
    unit: "MW",
  });
  assert.equal(firstThreeBuildings.facilityScope, "project");
  assert.equal(firstThreeBuildings.phaseScope, "exact-phase");
  assert.match(firstThreeBuildings.phaseIdentity, /first 3 buildings/i);
  assert.match(firstThreeBuildings.phaseIdentity, /3 buildings/);
});

test("recognizes common power wording, formatted values, and project-wide scope in one sentence", () => {
  const cases = [
    ["The Red Oak campus has 180 megawatts of power.", 180, "MW"],
    ["The Red Oak campus has 180 MW of IT load.", 180, "MW"],
    ["The Red Oak campus has 180 MW of total IT load.", 180, "MW"],
    ["The Red Oak campus has 180 MW of critical IT load.", 180, "MW"],
    ["The Red Oak campus has 180 MW of capacity.", 180, "MW"],
    ["A 1.2-gigawatt campus is planned for Red Oak.", 1.2, "gigawatt"],
    ["Across all eight phases, the Red Oak campus will provide 1,200 MW of total IT load.", 1200, "MW"],
    ["The Red Oak campus will provide 1.25 MW of critical IT load.", 1.25, "MW"],
  ];

  for (const [claimPassage, claimValue, unit] of cases) {
    assert.deepEqual(extractClaimScopeFromPassage({ claimPassage, claimValue, unit }), {
      facilityScope: "project",
      phaseScope: "all-phases",
      claimTimePeriod: null,
      phaseIdentity: null,
    }, claimPassage);
  }
});

test("keeps a phase figure and a named building at exact scope", () => {
  const phase = extractClaimScopeFromPassage({
    claimPassage: "Phase 1 will deliver 200 MW.",
    claimValue: 200,
    unit: "MW",
  });
  assert.deepEqual(phase, {
    facilityScope: "project",
    phaseScope: "exact-phase",
    claimTimePeriod: null,
    phaseIdentity: "Phase 1",
  });

  const firstBuilding = extractClaimScopeFromPassage({
    claimPassage: "The first building, with 60 MW of critical IT load, is planned for the Red Oak campus.",
    claimValue: 60,
    unit: "MW",
  });
  assert.equal(firstBuilding.facilityScope, "project");
  assert.equal(firstBuilding.phaseScope, "exact-phase");
  assert.match(firstBuilding.phaseIdentity, /first building/);
});

test("does not classify a phase value as campus-wide or resolve conflicting phase scope", () => {
  const phaseValue = extractClaimScopeFromPassage({
    claimPassage: "The Red Oak campus totals 480 MW, while Phase 1 will deliver 180 MW.",
    claimValue: 180,
    unit: "MW",
  });
  assert.equal(phaseValue.facilityScope, "project");
  assert.equal(phaseValue.phaseScope, "exact-phase");
  assert.equal(phaseValue.phaseIdentity, "Phase 1");

  const conflicting = extractClaimScopeFromPassage({
    claimPassage: "Phase 1 and Phase 2 each include 180 MW of IT load.",
    claimValue: 180,
    unit: "MW",
  });
  assert.deepEqual(conflicting, {
    facilityScope: "unknown",
    phaseScope: "unknown",
    claimTimePeriod: null,
    phaseIdentity: null,
  });
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