import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  calculateCashFlowModel,
  isMaterialEvidenceId,
  MATERIAL_EVIDENCE_IDS,
} from "./cashFlowEngine";
import {
  getAdvisorEvidenceSummary,
  getEvidenceCompletenessTier,
  getAdvisorQuestionPresentation,
  getGovernanceIRRGap,
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

function withMaterialClassification(
  materialSufficientCount: number,
  materialClassification: "Verified Evidence" | "Management Assertion" | "Missing Evidence" = "Verified Evidence",
) {
  const sufficientIds = new Set(MATERIAL_EVIDENCE_IDS.slice(0, materialSufficientCount));
  return Object.fromEntries(
    Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [
      id,
      {
        ...item,
        classification: isMaterialEvidenceId(id)
          ? sufficientIds.has(id)
            ? materialClassification
            : "Missing Evidence"
          : item.classification,
      },
    ]),
  );
}

test("initial advisor posture is materiality-aware and keeps the facility-level climate inference distinct from FEMA evidence", () => {
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

test("evidence completeness tiers use fewer-than-half, half-or-more, and all-material-ready boundaries", () => {
  const belowHalf = getAdvisorEvidenceSummary(withMaterialClassification(3));
  assert.equal(belowHalf.materialVerifiedCount, 3);
  assert.equal(getEvidenceCompletenessTier(belowHalf), "HIGH");

  const exactlyHalfOrMore = getAdvisorEvidenceSummary(withMaterialClassification(4));
  assert.equal(exactlyHalfOrMore.materialVerifiedCount, 4);
  assert.equal(getEvidenceCompletenessTier(exactlyHalfOrMore), "MODERATE");

  const allMaterialReady = getAdvisorEvidenceSummary(withMaterialClassification(7));
  assert.equal(allMaterialReady.materialVerifiedCount, 7);
  assert.equal(allMaterialReady.materialMissingCount, 0);
  assert.equal(getEvidenceCompletenessTier(allMaterialReady), "LOW");
});

test("Management Assertion counts as materially sufficient while active gaps remain completeness-driving", () => {
  const managementAssertions = getAdvisorEvidenceSummary(
    withMaterialClassification(4, "Management Assertion"),
  );
  assert.equal(managementAssertions.materialVerifiedCount, 4);
  assert.equal(managementAssertions.materialGapCount, 3);
  assert.equal(getEvidenceCompletenessTier(managementAssertions), "MODERATE");

  const materialGap = getAdvisorEvidenceSummary(
    withMaterialClassification(2, "Management Assertion"),
  );
  assert.equal(materialGap.materialMissingCount, 5);
  assert.equal(getEvidenceCompletenessTier(materialGap), "HIGH");
});

test("material sufficiency follows active classifications rather than optional model classifications", () => {
  const evidence = withMaterialClassification(3);
  evidence[MATERIAL_EVIDENCE_IDS[0]].modelClassification = "Missing Evidence";
  evidence[MATERIAL_EVIDENCE_IDS[1]].modelClassification = "Verified Evidence";
  const summary = getAdvisorEvidenceSummary(evidence);

  assert.equal(summary.materialVerifiedCount, 3);
  assert.equal(summary.materialGapCount, 4);
  assert.equal(getEvidenceCompletenessTier(summary), "HIGH");
});

test("four non-material verified inputs cannot outrank an under-half material posture", () => {
  const evidence = withMaterialClassification(0);
  const nonMaterialIds = Object.keys(evidence).filter((id) => !isMaterialEvidenceId(id));
  for (const id of nonMaterialIds) {
    evidence[id].classification = "Missing Evidence";
  }
  for (const id of nonMaterialIds.slice(0, 4)) {
    evidence[id].classification = "Verified Evidence";
  }
  const summary = getAdvisorEvidenceSummary(evidence);

  assert.equal(summary.verifiedCount, 4);
  assert.equal(summary.materialVerifiedCount, 0);
  assert.equal(getEvidenceCompletenessTier(summary), "HIGH");
});

test("two adequate material inputs remain high-gap completeness even when they are the only reassuring inputs", () => {
  const summary = getAdvisorEvidenceSummary(withMaterialClassification(2, "Management Assertion"));
  assert.equal(summary.materialVerifiedCount, 2);
  assert.equal(summary.totalInputCount, 16);
  assert.equal(getEvidenceCompletenessTier(summary), "HIGH");
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
