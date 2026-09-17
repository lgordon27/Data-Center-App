import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAdvisorBrief,
  generateAssetManagerBrief,
} from "./conferencePresentation";

function diligence(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      kind: "curated",
      name: "Stargate Abilene",
      location: "Taylor County, TX",
      description: "",
      capacityMW: 1200,
    },
    evidence: {},
    originatingCompany: null,
    metrics: {
      projectIRR: 12,
      recommendationStatus: "Review",
      unresolvedDecisionGateCount: 0,
      unresolvedFinancialDriverCount: 0,
    },
    ...overrides,
  } as never;
}

test("financial advisor coverage uses the approved exact labels", () => {
  assert.equal(
    generateAdvisorBrief(diligence()).coverageLabel,
    "Client conversation brief · evidence reviewed",
  );
  assert.equal(
    generateAdvisorBrief(diligence({
      metrics: {
        projectIRR: 12,
        recommendationStatus: "Review",
        unresolvedDecisionGateCount: 1,
        unresolvedFinancialDriverCount: 0,
      },
    })).coverageLabel,
    "Client conversation brief · material gaps remain",
  );
  assert.equal(
    generateAdvisorBrief(diligence({
      project: {
        kind: "custom",
        name: "Candidate",
        location: "Arizona",
        description: "",
        capacityMW: 100,
        researchMode: "research-incomplete",
      },
    })).coverageLabel,
    "Research incomplete · not conversation-ready",
  );
});


test("audience briefs share source facts but keep different contracts and boundaries", () => {
  const advisor = generateAdvisorBrief(diligence());
  const manager = generateAssetManagerBrief(diligence());
  assert.equal(advisor.evidenceAsOf, null);
  assert.equal(manager.evidenceAsOf, null);
  assert.equal(advisor.audience, "financial-advisor");
  assert.equal(manager.audience, "asset-manager");
  assert.equal(manager.portfolioMateriality, "Not assessed");
  assert.match(manager.projectMateriality.boundary, /not an issuer.*portfolio return/i);
  assert.equal("canonicalEvidence" in manager, false);
});