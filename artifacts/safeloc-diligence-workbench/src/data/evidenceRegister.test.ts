import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
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
  }
});

test("grid evidence preserves the cancelled expansion event and independent 2026 reporting", () => {
  const grid = INITIAL_EVIDENCE.grid_interconnection;

  assert.equal(grid.value, "Expansion cancelled; delays exceeded 12 months");
  assert.equal(grid.classification, "Verified Evidence");
  assert.match(grid.citation, /Epoch AI.*2026/i);
  assert.match(grid.citation, /WinBuzzer.*2026/i);
  assert.match(grid.citation, /SiliconReport.*2026/i);
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