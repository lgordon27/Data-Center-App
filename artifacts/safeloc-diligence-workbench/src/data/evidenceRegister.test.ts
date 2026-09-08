import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  assertEvidenceImpactRoleCoverage,
  EVIDENCE_IMPACT_ROLES,
  getEvidenceImpactRole,
  type ImpactRole,
} from "@/data/evidenceImpactRoles";
import type { Classification } from "@/model/cashFlowEngine";

const EXPECTED_IDS = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
] as const;

const EXPECTED_CLASSIFICATIONS: Record<(typeof EXPECTED_IDS)[number], Classification> = {
  electricity_cost: "User Assumption",
  water_consumption: "Missing Evidence",
  grid_interconnection: "Verified Evidence",
  water_escalation: "Model Inference",
  community_risk: "Verified Evidence",
  renewable_percentage: "Management Assertion",
  cooling_capex: "User Assumption",
  electricity_escalation: "Model Inference",
  carbon_compliance: "Model Inference",
  permitting_timeline: "Management Assertion",
  customer_concentration: "Management Assertion",
  water_rights: "Missing Evidence",
  site_hazard_exposure: "Verified Evidence",
  backup_power_capacity: "Management Assertion",
  water_source_resilience: "Model Inference",
  downtime_cost: "User Assumption",
};

const EXPECTED_IMPACT_ROLES: Record<(typeof EXPECTED_IDS)[number], ImpactRole> = {
  electricity_cost: "Financial Driver",
  water_consumption: "Financial Driver",
  grid_interconnection: "Financial Driver",
  water_escalation: "Financial Driver",
  community_risk: "Context Indicator",
  renewable_percentage: "Context Indicator",
  cooling_capex: "Financial Driver",
  electricity_escalation: "Financial Driver",
  carbon_compliance: "Financial Driver",
  permitting_timeline: "Financial Driver",
  customer_concentration: "Decision Gate",
  water_rights: "Decision Gate",
  site_hazard_exposure: "Financial Driver",
  backup_power_capacity: "Decision Gate",
  water_source_resilience: "Decision Gate",
  downtime_cost: "Financial Driver",
};

const DATED_CITATION = /\b20(?:2[0-9])\b/;

test("the canonical evidence register keeps all 16 complete and dated", () => {
  assert.deepEqual(Object.keys(INITIAL_EVIDENCE), EXPECTED_IDS);

  for (const id of EXPECTED_IDS) {
    const item = INITIAL_EVIDENCE[id];
    assert.ok(item.label.trim(), `${id} needs a label`);
    assert.notEqual(item.value, "", `${id} needs a value`);
    assert.ok(item.unit.trim(), `${id} needs a unit`);
    assert.ok(item.description.trim(), `${id} needs a description`);
    assert.ok(item.citation.trim(), `${id} needs a citation`);
    assert.match(item.citation, DATED_CITATION, `${id} citation must name a source year`);
    assert.equal(item.classification, EXPECTED_CLASSIFICATIONS[id], `${id} has an unexpected default provenance`);
    assert.equal(item.impactRole, EXPECTED_IMPACT_ROLES[id], `${id} has an unexpected impact role`);
  }
});

test("the impact-role taxonomy is complete, unique, and independent from provenance", () => {
  assert.deepEqual(EVIDENCE_IMPACT_ROLES, EXPECTED_IMPACT_ROLES);
  assert.doesNotThrow(() => assertEvidenceImpactRoleCoverage(EXPECTED_IDS));
  assert.throws(() => assertEvidenceImpactRoleCoverage(EXPECTED_IDS.slice(1)), /coverage mismatch/i);
  assert.throws(() => assertEvidenceImpactRoleCoverage([...EXPECTED_IDS.slice(0, -1), EXPECTED_IDS[0]]), /duplicates/i);
  assert.throws(() => getEvidenceImpactRole("not_an_evidence_id"), /no evidence impact role/i);

  for (const id of EXPECTED_IDS) {
    const changedProvenance = {
      ...INITIAL_EVIDENCE[id],
      classification: "Missing Evidence" as const,
    };
    assert.equal(changedProvenance.impactRole, EXPECTED_IMPACT_ROLES[id]);
  }
});

test("grid evidence carries the Batch Zero timeline while preserving verified provenance", () => {
  const grid = INITIAL_EVIDENCE.grid_interconnection;

  assert.equal(grid.value, "Expansion cancelled; grid delays exceeded 12 months. ERCOT Batch Zero studies delayed from September 2026 to January 2027 minimum. 17 facilities (6.6 GW) completed studies but stuck in Abbott's verification audit.");
  assert.equal(grid.classification, "Verified Evidence");
  assert.match(grid.citation, /ERCOT testimony before PUC \(August 20, 2026\)/i);
  assert.match(grid.citation, /House State Affairs Committee.*August 2026/i);
  assert.match(grid.citation, /Epoch AI.*2026/i);
  assert.match(grid.citation, /WinBuzzer.*2026/i);
  assert.match(grid.citation, /SiliconReport.*2026/i);
  assert.match(grid.description, /200 GW across 300 applicants/i);
  assert.match(grid.description, /September 2026 start, April 2027 completion/i);
  assert.match(grid.description, /January 2027 start at earliest, completion date unclear/i);
  assert.match(grid.description, /financing constraints/i);
  assert.match(grid.description, /market context, not proof of a named Stargate connection/i);
  assert.match(grid.description, /independent/i);
});

test("provenance-specific citations preserve the evidence boundary", () => {
  const managementIds = ["renewable_percentage", "permitting_timeline", "customer_concentration", "backup_power_capacity"];
  for (const id of managementIds) {
    assert.match(INITIAL_EVIDENCE[id].citation, /OpenAI|Oracle|Crusoe|Lancium/i, `${id} needs a dated company disclosure`);
  }

  for (const id of ["water_consumption", "water_rights"]) {
    const item = INITIAL_EVIDENCE[id];
    assert.match(item.citation, /searched/i, `${id} must describe the dated search`);
    assert.match(item.citation, /no .* (found|disclosed)/i, `${id} must say what was not found`);
  }

  for (const id of ["electricity_cost", "cooling_capex", "downtime_cost"]) {
    assert.match(INITIAL_EVIDENCE[id].description, /synthetic|selected by the analyst/i, `${id} must remain visibly synthetic`);
  }
  for (const id of ["water_escalation", "electricity_escalation", "carbon_compliance", "water_source_resilience"]) {
    assert.match(INITIAL_EVIDENCE[id].description, /inferred|inference/i, `${id} must remain visibly inferred`);
  }
});