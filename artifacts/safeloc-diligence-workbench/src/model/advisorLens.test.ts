import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import { calculateCashFlowModel } from "./cashFlowEngine";
import {
  countVerifiedEvidence,
  getAdvisorQuestionPresentation,
  getGovernanceIRRGap,
  getRiskTier,
  prioritizeAdvisorQuestions,
} from "./advisorLens";

function reclassify(
  ids: string[],
  classification: "Verified Evidence" | "Missing Evidence",
) {
  return Object.fromEntries(
    Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [
      id,
      {
        ...item,
        classification: ids.includes(id) ? classification : item.classification,
      },
    ]),
  );
}

function withVerifiedCount(count: number) {
  const entries = Object.entries(INITIAL_EVIDENCE);
  return Object.fromEntries(
    entries.map(([id, item], index) => [
      id,
      {
        ...item,
        classification: index < count ? "Verified Evidence" : "Missing Evidence",
      },
    ]),
  );
}

test("initial advisor posture keeps the facility-level climate inference distinct from FEMA evidence", () => {
  const verifiedCount = countVerifiedEvidence(INITIAL_EVIDENCE);
  const questions = prioritizeAdvisorQuestions(INITIAL_EVIDENCE);

  assert.equal(Object.keys(INITIAL_EVIDENCE).length, 16);
   assert.equal(verifiedCount, 3);
   assert.equal(getRiskTier(verifiedCount), "HIGH");
  assert.deepEqual(
    questions.slice(0, 2).map((question) => question.id),
    ["water-rights", "climate-hazard"],
  );
  const waterPresentation = getAdvisorQuestionPresentation(
    "water-rights",
    INITIAL_EVIDENCE.water_rights.classification,
  );
  assert.equal(waterPresentation.isActiveGap, true);
  assert.equal(waterPresentation.showDetail, true);
  assert.equal(waterPresentation.isWaterGap, true);
  const climatePresentation = getAdvisorQuestionPresentation(
    "climate-hazard",
    INITIAL_EVIDENCE.site_hazard_exposure.modelClassification ??
      INITIAL_EVIDENCE.site_hazard_exposure.classification,
  );
  assert.equal(climatePresentation.isActiveGap, true);
  assert.equal(climatePresentation.showDetail, true);
});

test("reclassifying water rights and grid interconnection resolves their active emphasis", () => {
  const evidence = reclassify(
    ["water_rights", "grid_interconnection"],
    "Verified Evidence",
  );
  const questions = prioritizeAdvisorQuestions(evidence);

  const waterPresentation = getAdvisorQuestionPresentation(
    "water-rights",
    evidence.water_rights.classification,
  );
  const energizationPresentation = getAdvisorQuestionPresentation(
    "energization",
    evidence.grid_interconnection.classification,
  );
  assert.equal(waterPresentation.isActiveGap, false);
  assert.equal(waterPresentation.showDetail, false);
  assert.equal(waterPresentation.isWaterGap, false);
  assert.equal(energizationPresentation.isActiveGap, false);
  assert.equal(energizationPresentation.showDetail, false);
  assert.equal(energizationPresentation.isEnergizationGap, false);
  assert.equal(questions.findIndex((question) => question.id === "water-rights") > 0, true);
  assert.equal(questions.findIndex((question) => question.id === "energization") > 0, true);
});

test("risk tiers stay aligned at the 4, 8, and 9 verified-input thresholds", () => {
  const expectedTiers = new Map([
    [4, "MODERATE"],
    [8, "MODERATE"],
    [9, "LOW"],
  ] as const);

  for (const [count, expectedTier] of expectedTiers) {
    const evidence = withVerifiedCount(count);
    assert.equal(countVerifiedEvidence(evidence), count);
    assert.equal(getRiskTier(countVerifiedEvidence(evidence)), expectedTier);
  }
  assert.equal(getRiskTier(3), "HIGH");
});

test("governance gap equals verified baseline IRR less current IRR and is safe when unavailable", () => {
  const initialModel = calculateCashFlowModel(INITIAL_EVIDENCE);
  const changedEvidence = reclassify(
    ["water_rights", "grid_interconnection"],
    "Verified Evidence",
  );
  const changedModel = calculateCashFlowModel(changedEvidence);

  assert.notEqual(changedModel.projectIRR, null);
  assert.notEqual(changedModel.baseIRR, null);
  assert.equal(
    getGovernanceIRRGap(changedModel.baseIRR, changedModel.projectIRR),
    changedModel.baseIRR! - changedModel.projectIRR!,
  );
  assert.notEqual(
    getGovernanceIRRGap(changedModel.baseIRR, changedModel.projectIRR),
    Number((changedModel.baseIRR! - changedModel.projectIRR!).toFixed(1)),
  );
  assert.notEqual(
    getGovernanceIRRGap(initialModel.baseIRR, initialModel.projectIRR),
    null,
  );
  assert.equal(getGovernanceIRRGap(null, 12.5), null);
  assert.equal(getGovernanceIRRGap(18.5, undefined), null);
  assert.equal(getGovernanceIRRGap(Number.NaN, 12.5), null);
});

test("the climate hazard question is exact and carries the separate model classification", () => {
  const questions = prioritizeAdvisorQuestions(INITIAL_EVIDENCE);
  const climateQuestion = questions.find((question) => question.id === "climate-hazard");

  assert.equal(
    climateQuestion?.question,
    "What site-level climate hazard assessment has been conducted for facilities in water-stressed or extreme-heat regions, and what adaptation investments are planned?",
  );
  assert.equal(climateQuestion?.classification, "Model Inference");
  assert.equal(
    questions.findIndex((question) => question.id === "climate-hazard") <
      questions.findIndex((question) => question.id === "energization"),
    true,
  );
});