import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_SEMANTIC_IDS,
  EVIDENCE_SEMANTIC_POLICY,
  EVIDENCE_SEMANTIC_POLICY_VERSION,
  assertEvidenceSemanticPolicyCoverage,
  evaluateEvidenceSourceEligibility,
  getEvidenceSemanticDefinition,
  normalizeEvidenceRecord,
} from "./evidenceSemanticPolicy.mjs";

test("defines exactly the 16 evidence variables with complete semantic metadata", () => {
  assert.equal(EVIDENCE_SEMANTIC_IDS.length, 16);
  assert.equal(assertEvidenceSemanticPolicyCoverage(), true);
  for (const id of EVIDENCE_SEMANTIC_IDS) {
    const definition = getEvidenceSemanticDefinition(id);
    assert.ok(definition);
    assert.equal(definition.id, id);
    assert.ok(definition.meaning);
    assert.ok(definition.dimension);
    assert.ok(definition.canonicalUnit);
    assert.ok(definition.allowedUnits.length > 0);
    assert.ok(definition.eligibleSourceScope);
    assert.ok(definition.eligibleSourceTypes.length > 0);
    assert.equal(typeof definition.projectSpecificityRequired, "boolean");
    assert.ok(definition.impactRole);
    assert.ok(definition.materiality);
    assert.ok(definition.fallbackPolicy);
    assert.equal(definition.humanAcceptanceRequired, true);
    assert.ok(Object.hasOwn(EVIDENCE_SEMANTIC_POLICY, id));
  }
});

test("normalizes every supported numeric conversion without changing raw inputs", () => {
  const cases = [
    ["electricity_cost", 7.3, "cents/kWh", 73, "USD/MWh", "facility tariff"],
    ["water_consumption", 3_785_411.784, "gallons/year", 3.785411784, "Mgal/year", "facility"],
    ["water_escalation", 0.07, "fraction", 7, "%", "facility contract"],
    ["electricity_escalation", 700, "basis points", 7, "%", "facility tariff"],
    ["cooling_capex", 450_000, "USD thousands", 450, "USD millions", "project budget"],
    ["carbon_compliance", 1_000_000, "USD/year", 1, "USD millions/year", "facility permit"],
    ["downtime_cost", 30_416_666.67, "USD/month", 1_000_000, "USD/day", "facility SLA"],
    ["grid_interconnection", 365, "days", 365 / 30.4375, "months", "project milestone"],
    ["backup_power_capacity", 2, "days", 48, "hours", "facility generator"],
  ] as const;
  for (const [id, value, unit, expected, normalizedUnit, context] of cases) {
    const result = normalizeEvidenceRecord({
      id,
      value,
      numericValue: value,
      unit,
      description: context,
      explicitZero: false,
    });
    assert.equal(result.policyVersion, EVIDENCE_SEMANTIC_POLICY_VERSION);
    assert.equal(result.validationStatus, "valid", `${id} should be valid`);
    assert.equal(result.normalizedUnit, normalizedUnit);
    assert.ok(Math.abs((result.normalizedValue as number) - expected) < 0.2, id);
    assert.notEqual(result.conversion, "none", id);
  }
  const symbolAlias = normalizeEvidenceRecord({
    id: "electricity_cost",
    value: 42,
    numericValue: 42,
    unit: "$/MWh",
    description: "facility tariff",
    explicitZero: false,
  });
  assert.equal(symbolAlias.validationStatus, "valid");
  assert.equal(symbolAlias.normalizedValue, 42);
});

test("derives duration from dates and rejects invalid or missing units", () => {
  const dated = normalizeEvidenceRecord({
    id: "permitting_timeline",
    value: "2026-01-01 to 2027-01-01",
    unit: "date range",
  });
  assert.equal(dated.validationStatus, "valid");
  assert.equal(dated.normalizedUnit, "months");
  assert.ok((dated.normalizedValue as number) > 11.9 && (dated.normalizedValue as number) < 12.1);

  for (const input of [
    { id: "grid_interconnection", value: 12, numericValue: 12, unit: "MW" },
    { id: "electricity_cost", value: 42, numericValue: 42, unit: undefined },
    { id: "cooling_capex", value: -1, numericValue: -1, unit: "USD millions" },
    { id: "water_escalation", value: 2, numericValue: 2, unit: "MW" },
    { id: "electricity_cost", value: 42, numericValue: 42, unit: "USD/year" },
  ]) {
    const result = normalizeEvidenceRecord(input);
    assert.equal(result.validationStatus, "unresolved");
    assert.equal(result.modelEligible, false);
    assert.ok(result.quarantineReasons.length > 0);
  }
  assert.match(
    normalizeEvidenceRecord({ id: "electricity_cost", value: 42, numericValue: 42 }).quarantineReasons.join(" "),
    /unit/i,
  );
});

test("requires explicit zero, rejects residential tariffs, and keeps qualitative/context records out of the model", () => {
  const zero = normalizeEvidenceRecord({
    id: "grid_interconnection",
    value: 0,
    numericValue: 0,
    unit: "months",
    description: "Behind-the-meter project exemption",
    explicitZero: true,
  });
  assert.equal(zero.validationStatus, "valid");
  assert.equal(zero.normalizedValue, 0);

  const implicitZero = normalizeEvidenceRecord({
    id: "grid_interconnection",
    value: 0,
    numericValue: 0,
    unit: "months",
    description: "Project timeline",
  });
  assert.equal(implicitZero.validationStatus, "unresolved");
  assert.match(implicitZero.quarantineReasons.join(" "), /Zero/);

  const residential = normalizeEvidenceRecord({
    id: "electricity_cost",
    value: 7.3,
    numericValue: 7.3,
    unit: "cents/kWh",
    description: "Residential household electricity rate",
  });
  assert.equal(residential.modelEligible, false);
  assert.match(residential.quarantineReasons.join(" "), /Residential/);

  const context = normalizeEvidenceRecord({
    id: "renewable_percentage",
    value: 0.25,
    numericValue: 0.25,
    unit: "fraction",
  });
  assert.equal(context.validationStatus, "valid");
  assert.equal(context.modelEligible, false);
});

test("normalizes qualitative vocabulary while quarantining unknown values", () => {
  const valid = normalizeEvidenceRecord({
    id: "site_hazard_exposure",
    value: "HIGH",
    qualitativeValue: "high",
    unit: "facility exposure",
  });
  assert.equal(valid.validationStatus, "valid");
  assert.equal(valid.modelEligible, true);

  const invalid = normalizeEvidenceRecord({
    id: "water_source_resilience",
    value: "single source",
    unit: "supply",
  });
  assert.equal(invalid.validationStatus, "unresolved");
  assert.equal(invalid.modelEligible, false);
  assert.match(invalid.quarantineReasons.join(" "), /Qualitative/);
  const wrongDimension = normalizeEvidenceRecord({
    id: "site_hazard_exposure",
    value: "high",
    unit: "MW",
  });
  assert.equal(wrongDimension.validationStatus, "unresolved");
  assert.match(wrongDimension.quarantineReasons.join(" "), /incompatible qualitative unit/i);
});

test("source scope, specificity, and source type come from the canonical definition", () => {
  const geographicHazard = evaluateEvidenceSourceEligibility({
    id: "site_hazard_exposure",
    sources: [{ exactProject: false, sourceClass: "primary-government" }],
    classification: "Management Assertion",
    sourceSupportConfidence: 80,
  });
  assert.equal(geographicHazard.eligible, true);

  const gridContextOnly = evaluateEvidenceSourceEligibility({
    id: "grid_interconnection",
    sources: [{ exactProject: false, sourceClass: "primary-government" }],
    classification: "Management Assertion",
    sourceSupportConfidence: 80,
  });
  assert.equal(gridContextOnly.eligible, false);
  assert.match(gridContextOnly.reasons.join(" "), /exact-project/i);

  const wrongType = evaluateEvidenceSourceEligibility({
    id: "electricity_cost",
    sources: [{ exactProject: true, sourceClass: "primary-regulatory" }],
    classification: "Verified Evidence",
    sourceSupportConfidence: 90,
  });
  assert.equal(wrongType.eligible, false);
  assert.match(wrongType.reasons.join(" "), /eligible source types/i);
});
