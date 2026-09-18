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
    financialModeling: {
      status: "modeled",
      label: "Audited Stargate synthetic project model",
      reason: "Audited case.",
      requiredInputs: [],
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

test("canonical briefs use the authoritative dossier date instead of later source dates", () => {
  const canonical = diligence({
    project: {
      kind: "curated",
      name: "Project Kilby",
      location: "Atlanta, Georgia",
      description: "",
      capacityMW: 100,
      canonicalDossier: {
        asOfDate: "2026-06-22",
        coverageState: "material-gaps",
        canonicalData: { identity: { scope: "Reviewed scope" }, materiality: {}, questions: [], triggers: [] },
      },
    },
    evidence: {
      grid: {
        id: "grid",
        label: "Grid",
        value: "Reviewed",
        description: "Reviewed grid record.",
        sourcePublishedAt: "2026-09-17",
        classification: "Verified Evidence",
        coverageStatus: "complete",
        claimIds: [],
        sources: [],
      },
    },
  });
  assert.equal(generateAdvisorBrief(canonical).evidenceAsOf, "2026-06-22");
  assert.equal(generateAssetManagerBrief(canonical).evidenceAsOf, "2026-06-22");
});

test("model-neutral projects never inherit the Stargate return in audience outputs", () => {
  const modelNeutral = diligence({
    project: {
      kind: "custom",
      name: "Exact Project",
      location: "Arizona",
      description: "",
      capacityMW: 100,
      researchMode: "research-incomplete",
    },
    financialModeling: {
      status: "not-modeled",
      label: "Not modeled",
      reason: "No approved transaction-level financial scenario.",
      requiredInputs: ["Approved transaction price"],
    },
    metrics: {
      projectIRR: -16.7,
      recommendationStatus: "BLOCKED",
      unresolvedDecisionGateCount: 4,
      unresolvedFinancialDriverCount: 10,
    },
  });
  const advisor = generateAdvisorBrief(modelNeutral);
  const manager = generateAssetManagerBrief(modelNeutral);
  assert.equal(advisor.primaryCase.projectIRR, null);
  assert.equal(advisor.primaryCase.recommendationStatus, "NOT MODELED");
  assert.match(advisor.primaryCase.boundary, /approved transaction price/i);
  assert.equal(manager.projectMateriality.scenarioRole, "No approved project financial scenario");
  assert.doesNotMatch(JSON.stringify({ advisor, manager }), /-16\.7/);
});