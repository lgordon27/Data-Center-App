import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  BACKUP_POWER_CAPEX_BY_CLASSIFICATION,
  calculateCashFlowModel,
  CLIMATE_QUALITY_MULTIPLIERS,
  type Classification,
  type EvidenceRecord,
  WATER_CONVERSION_CAPEX_BY_CLASSIFICATION,
} from "./cashFlowEngine";

const CLASSIFICATIONS: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

function allVerified(): EvidenceRecord {
  return Object.fromEntries(
    Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [
      id,
      { ...item, classification: "Verified Evidence" as const },
    ]),
  );
}

function classify(
  evidence: EvidenceRecord,
  id: string,
  classification: Classification,
): EvidenceRecord {
  return {
    ...evidence,
    [id]: { ...evidence[id], classification },
  };
}

test("the canonical evidence contract has 16 items and a 16-item confidence denominator", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);

  assert.equal(Object.keys(INITIAL_EVIDENCE).length, 16);
  assert.equal(model.confidenceScore, 55);
  assert.equal(
    model.assumptions.siteHazardExposure,
    "Extreme heat high; drought moderate; winter storm documented",
  );
  assert.equal(model.assumptions.backupPowerHours, 0);
  assert.equal(model.assumptions.waterSourceEscalationMultiplier, 1.5);
  assert.equal(model.assumptions.downtimeCostPerDay, 2_850_000);
  assert.equal(model.assumptions.capacityMW, 1_200);
  assert.equal(model.assumptions.entryValue, 4_800);
});

test("climate quality multipliers adjust hazard probability and downtime cost", () => {
  const verified = allVerified();

  for (const classification of CLASSIFICATIONS) {
    const hazardModel = calculateCashFlowModel(
      classify(verified, "site_hazard_exposure", classification),
    );
    assert.equal(
      hazardModel.assumptions.adjustedHazardProbability,
      0.05 * CLIMATE_QUALITY_MULTIPLIERS[classification],
    );

    const downtimeModel = calculateCashFlowModel(
      classify(verified, "downtime_cost", classification),
    );
    assert.equal(
      downtimeModel.assumptions.adjustedDowntimeCostPerDay,
      2_850_000 * CLIMATE_QUALITY_MULTIPLIERS[classification],
    );
  }

  const lowMissingCost = allVerified();
  lowMissingCost.downtime_cost = {
    ...lowMissingCost.downtime_cost,
    numericValue: 1_000_000,
    classification: "Missing Evidence",
  };
  assert.equal(
    calculateCashFlowModel(lowMissingCost).assumptions.adjustedDowntimeCostPerDay,
    5_000_000,
  );
});

test("climate disruption is annual OPEX and reduces NOI and terminal value once", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);
  const yearFive = model.schedule[5];
  const expected =
    (model.assumptions.adjustedDowntimeCostPerDay *
      model.assumptions.adjustedHazardProbability *
      365 *
      yearFive.operatingUtilization) /
    1_000_000;

  assert.ok(Math.abs(yearFive.climateDisruptionOpex - expected) < 0.000001);
  assert.equal(
    yearFive.terminalValue,
    Math.max(0, yearFive.noi * model.assumptions.exitMultiple),
  );
  assert.equal(
    yearFive.totalOpex >=
      yearFive.climateDisruptionOpex + yearFive.backupPowerOpex,
    true,
  );
});

test("backup power contingency follows its trigger and classification mapping", () => {
  const verified = allVerified();
  assert.equal(calculateCashFlowModel(verified).assumptions.backupPowerCapex, 0);

  for (const classification of CLASSIFICATIONS) {
    let evidence = classify(verified, "grid_interconnection", "Management Assertion");
    evidence = classify(evidence, "backup_power_capacity", classification);
    const model = calculateCashFlowModel(evidence);
    assert.equal(
      model.assumptions.backupPowerCapex,
      BACKUP_POWER_CAPEX_BY_CLASSIFICATION[classification],
    );
    assert.equal(model.schedule[5].backupPowerOpex, 2 * model.schedule[5].operatingUtilization);
  }

  const sufficientBackup = classify(
    classify(verified, "grid_interconnection", "Management Assertion"),
    "backup_power_capacity",
    "Missing Evidence",
  );
  sufficientBackup.backup_power_capacity = {
    ...sufficientBackup.backup_power_capacity,
    numericValue: 96,
    classification: "Verified Evidence",
  };
  assert.equal(calculateCashFlowModel(sufficientBackup).assumptions.backupPowerCapex, 0);
});

test("water conversion contingency and stressed-basin escalation follow their branches", () => {
  const verified = allVerified();
  const base = calculateCashFlowModel(verified);
  assert.equal(base.assumptions.waterSourceEscalationMultiplier, 1.5);
  assert.ok(Math.abs(base.assumptions.waterEscalationRate - 0.105) < 0.000001);
  assert.equal(base.assumptions.waterConversionCapex, 0);

  for (const classification of CLASSIFICATIONS.slice(1)) {
    let evidence = classify(verified, "water_rights", "Management Assertion");
    evidence = classify(evidence, "water_source_resilience", classification);
    assert.equal(
      calculateCashFlowModel(evidence).assumptions.waterConversionCapex,
      WATER_CONVERSION_CAPEX_BY_CLASSIFICATION[classification],
    );
  }

  let protectedSource = classify(verified, "water_rights", "Verified Evidence");
  protectedSource = classify(protectedSource, "water_source_resilience", "Missing Evidence");
  assert.equal(calculateCashFlowModel(protectedSource).assumptions.waterConversionCapex, 0);

  const diversifiedSource = allVerified();
  diversifiedSource.water_source_resilience = {
    ...diversifiedSource.water_source_resilience,
    qualitativeValue: "diversified",
  };
  assert.equal(
    calculateCashFlowModel(diversifiedSource).assumptions.waterSourceEscalationMultiplier,
    1,
  );
});

test("display copy changes do not change structured model outputs", () => {
  const editedEvidence = {
    ...INITIAL_EVIDENCE,
    electricity_cost: {
      ...INITIAL_EVIDENCE.electricity_cost,
      value: "A completely different editorial power-rate note",
    },
    site_hazard_exposure: {
      ...INITIAL_EVIDENCE.site_hazard_exposure,
      value: "Rewritten hazard narrative with unrelated wording",
    },
  };

  assert.deepEqual(calculateCashFlowModel(editedEvidence), calculateCashFlowModel(INITIAL_EVIDENCE));
});

test("climate uncertainty propagates through returns and material recommendation rules", () => {
  const verified = calculateCashFlowModel(allVerified());
  const current = calculateCashFlowModel(INITIAL_EVIDENCE);

  assert.notEqual(verified.projectIRR, null);
  assert.notEqual(current.projectIRR, null);
  assert.ok(current.projectIRR! < verified.projectIRR!);
  assert.ok(current.npv < verified.npv);
  assert.ok(current.moic < verified.moic);
  assert.ok(current.terminalValue < verified.terminalValue);
  assert.ok(current.lineItems.site_hazard_exposure.deltaIRR < 0);
  assert.ok(current.lineItems.downtime_cost.deltaIRR < 0);

  const backupMissing = calculateCashFlowModel(
    classify(allVerified(), "backup_power_capacity", "Missing Evidence"),
  );
  assert.equal(backupMissing.recommendationStatus, "BLOCKED");
  assert.equal(backupMissing.missingMaterialCount, 1);

  const sourceInferred = calculateCashFlowModel(
    classify(allVerified(), "water_source_resilience", "Model Inference"),
  );
  assert.equal(sourceInferred.recommendationStatus, "CONDITIONAL");
  assert.equal(sourceInferred.materialUnverifiedCount, 1);
});