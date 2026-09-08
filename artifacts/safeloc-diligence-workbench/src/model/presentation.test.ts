import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCount,
  formatCurrency,
  formatIRR,
  formatPayback,
  formatPercentagePoints,
  formatScenarioDelta,
} from "@/components/Shell";
import { getEvidenceImpactRoleDefinition } from "@/data/evidenceImpactRoles";

test("shared financial presentation formatting avoids raw precision and signed zero", () => {
  assert.equal(formatCurrency(-12.345), "−$12.3M");
  assert.equal(formatIRR(null), "N/M");
  assert.equal(formatPayback(1), "1.0 year");
  assert.equal(formatPayback(2), "2.0 years");
  assert.equal(formatPercentagePoints(0.004), "less than 0.01 pts");
  assert.equal(formatPercentagePoints(-4.256, { signed: true }), "-4.3 pts");
  assert.equal(formatScenarioDelta(10, 10.001, "irr"), "less than 0.01 pts");
  assert.equal(formatCount(1, "material gap"), "1 material gap");
  assert.equal(formatCount(2, "material gap"), "2 material gaps");
});

test("evidence semantics keep provenance, modeled treatment, and financial role distinct", () => {
  const hazard = getEvidenceImpactRoleDefinition("site_hazard_exposure");
  assert.equal(hazard.role, "Financial Driver");
  assert.match(hazard.description, /modeled climate-disruption cost/i);
});