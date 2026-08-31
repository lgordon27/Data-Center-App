import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  BACKUP_POWER_CAPEX_BY_CLASSIFICATION,
  calculateCashFlowModel,
  CLIMATE_QUALITY_MULTIPLIERS,
  MATERIAL_EVIDENCE_IDS,
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
      {
        ...item,
        classification: "Verified Evidence" as const,
        modelClassification: item.modelClassification
          ? "Verified Evidence" as const
          : undefined,
      },
    ]),
  );
}

function allMissing(): EvidenceRecord {
  return Object.fromEntries(
    Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [
      id,
      {
        ...item,
        classification: "Missing Evidence" as const,
        modelClassification: item.modelClassification
          ? "Missing Evidence" as const
          : undefined,
      },
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
  assert.equal(INITIAL_EVIDENCE.electricity_cost.classification, "User Assumption");
  assert.equal(INITIAL_EVIDENCE.electricity_escalation.classification, "Model Inference");
  assert.equal(INITIAL_EVIDENCE.customer_concentration.classification, "Management Assertion");
  assert.equal(model.confidenceScore, 48);
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

test("synthetic return calibration separates verified, default, and all-missing cases", () => {
  const verified = calculateCashFlowModel(allVerified());
  const current = calculateCashFlowModel(INITIAL_EVIDENCE);
  const missing = calculateCashFlowModel(allMissing());

  assert.notEqual(verified.projectIRR, null);
  assert.notEqual(current.projectIRR, null);
  assert.notEqual(missing.projectIRR, null);
  assert.ok(verified.projectIRR! >= 15 && verified.projectIRR! <= 16);
  assert.ok(current.projectIRR! >= 8 && current.projectIRR! <= 11);
  assert.ok(missing.projectIRR! < 0);

  const defaultSpread = verified.projectIRR! - current.projectIRR!;
  assert.ok(defaultSpread >= 5 && defaultSpread <= 7);
  assert.equal(current.baseIRR, verified.projectIRR);
  assert.equal(missing.mechanicalDisclaimer, true);

  for (const metric of ["moic", "npv", "cashOnCash", "terminalValue"] as const) {
    assert.ok(verified[metric] > current[metric], `${metric} should fall in the default case`);
    assert.ok(current[metric] > missing[metric], `${metric} should fall again when all evidence is missing`);
  }
  assert.ok(verified.payback! < current.payback!);
  assert.equal(missing.payback, null);
  assert.ok(verified.totalDistributions > current.totalDistributions);
  assert.ok(current.totalDistributions > missing.totalDistributions);
  assert.ok(verified.equityInvested < current.equityInvested);
  assert.ok(current.equityInvested < missing.equityInvested);

  assert.equal(verified.schedule.length, 6);
  assert.equal(current.schedule.length, 6);
  assert.equal(missing.schedule.length, 6);
  for (let index = 0; index < verified.schedule.length; index += 1) {
    assert.ok(
      verified.schedule[index].netEquityCashFlow >= current.schedule[index].netEquityCashFlow,
      `verified cash flow should not trail default in year ${index}`,
    );
    assert.ok(
      current.schedule[index].netEquityCashFlow >= missing.schedule[index].netEquityCashFlow,
      `default cash flow should not trail all-missing in year ${index}`,
    );
  }
  for (const model of [verified, current, missing]) {
    let cumulative = 0;
    for (const year of model.schedule) {
      cumulative += year.netEquityCashFlow;
      assert.ok(Math.abs(year.cumulativeEquityCashFlow - cumulative) < 0.000001);
    }
    assert.equal(model.terminalValue, model.schedule[5].terminalValue);
    assert.equal(model.assumptions.terminalValue, model.schedule[5].terminalValue);
  }
});

test("single-item missing-evidence sensitivity is visible and bounded", () => {
  const verifiedEvidence = allVerified();
  const verified = calculateCashFlowModel(verifiedEvidence);
  const current = calculateCashFlowModel(INITIAL_EVIDENCE);
  assert.notEqual(verified.projectIRR, null);
  assert.notEqual(current.projectIRR, null);

  const representative = calculateCashFlowModel(
    classify(verifiedEvidence, "downtime_cost", "Missing Evidence"),
  );
  assert.notEqual(representative.projectIRR, null);
  const representativePenalty = verified.projectIRR! - representative.projectIRR!;
  assert.ok(representativePenalty >= 1 && representativePenalty <= 3);

  const defaultDeterioration = verified.projectIRR! - current.projectIRR!;
  const singleItemPenalties = Object.keys(verifiedEvidence).map((id) => {
    const item = verifiedEvidence[id];
    const stressed = calculateCashFlowModel({
      ...verifiedEvidence,
      [id]: {
        ...item,
        classification: "Missing Evidence",
        modelClassification: item.modelClassification
          ? "Missing Evidence"
          : undefined,
      },
    });
    return stressed.projectIRR === null ? Number.POSITIVE_INFINITY : verified.projectIRR! - stressed.projectIRR;
  });

  assert.ok(Math.max(...singleItemPenalties) < defaultDeterioration);
  assert.deepEqual(Object.keys(current.lineItems), Object.keys(INITIAL_EVIDENCE));
});

test("climate quality multipliers adjust hazard probability and downtime cost", () => {
  const verified = allVerified();

  for (const classification of CLASSIFICATIONS) {
    const hazardEvidence = classify(verified, "site_hazard_exposure", "Verified Evidence");
    hazardEvidence.site_hazard_exposure = {
      ...hazardEvidence.site_hazard_exposure,
      modelClassification: classification,
    };
    const hazardModel = calculateCashFlowModel(hazardEvidence);
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
  const model = calculateCashFlowModel(allVerified());
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

test("a structured EIA electricity rate flows through the existing quality policy", () => {
  const eiaEvidence = {
    ...INITIAL_EVIDENCE,
    electricity_cost: {
      ...INITIAL_EVIDENCE.electricity_cost,
      value: "Editorial copy is not parsed",
      numericValue: 55,
      sourceId: "eia" as const,
    },
  };
  const model = calculateCashFlowModel(eiaEvidence);
  assert.equal(model.assumptions.electricityRate, 55 * 1.05);

  const inferred = {
    ...eiaEvidence,
    electricity_cost: {
      ...eiaEvidence.electricity_cost,
      classification: "Model Inference" as const,
    },
  };
  assert.equal(calculateCashFlowModel(inferred).assumptions.electricityRate, 55 * 1.15);
});

test("financial metrics retain model precision beyond their display formats", () => {
  const precisionEvidence = allVerified();
  precisionEvidence.site_hazard_exposure = {
    ...precisionEvidence.site_hazard_exposure,
    modelClassification: "User Assumption",
  };
  precisionEvidence.downtime_cost = {
    ...precisionEvidence.downtime_cost,
    classification: "User Assumption",
  };
  const model = calculateCashFlowModel(precisionEvidence);

  assert.notEqual(model.projectIRR, null);
  assert.notEqual(model.projectIRR, Number(model.projectIRR!.toFixed(1)));
  assert.notEqual(model.moic, Number(model.moic.toFixed(2)));
  assert.notEqual(model.cashOnCash, Number(model.cashOnCash.toFixed(1)));
  assert.notEqual(model.payback, null);
  assert.notEqual(model.payback, Number(model.payback!.toFixed(1)));
  assert.notEqual(model.npv, Number(model.npv.toFixed(0)));
  assert.notEqual(
    model.lineItems.site_hazard_exposure.deltaIRR,
    Number(model.lineItems.site_hazard_exposure.deltaIRR.toFixed(1)),
  );
  assert.notEqual(
    model.lineItems.downtime_cost.deltaIRR,
    Number(model.lineItems.downtime_cost.deltaIRR.toFixed(1)),
  );
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

test("the material evidence contract governs every recommendation transition", () => {
  assert.deepEqual(MATERIAL_EVIDENCE_IDS, [
    "community_risk",
    "water_rights",
    "grid_interconnection",
    "customer_concentration",
    "permitting_timeline",
    "backup_power_capacity",
    "water_source_resilience",
  ]);

  for (const id of MATERIAL_EVIDENCE_IDS) {
    for (const classification of CLASSIFICATIONS) {
      const model = calculateCashFlowModel(classify(allVerified(), id, classification));
      if (classification === "Missing Evidence") {
        assert.equal(model.recommendationStatus, "BLOCKED", `${id} should block when missing`);
        assert.equal(model.missingMaterialCount, 1);
      } else if (
        classification === "Model Inference" ||
        classification === "User Assumption"
      ) {
        assert.equal(model.recommendationStatus, "CONDITIONAL", `${id} should be conditional`);
        assert.equal(model.materialUnverifiedCount, 1);
      } else {
        assert.equal(model.recommendationStatus, "READY FOR REVIEW", `${id} should be supported`);
        assert.equal(model.materialUnverifiedCount, 0);
      }
    }
  }

  const nonMaterialMissing = calculateCashFlowModel(
    classify(allVerified(), "water_consumption", "Missing Evidence"),
  );
  assert.equal(nonMaterialMissing.recommendationStatus, "READY FOR REVIEW");
  assert.equal(nonMaterialMissing.missingMaterialCount, 0);
  assert.equal(nonMaterialMissing.materialUnverifiedCount, 0);
});

test("custom project capacity scales standardized economics without changing the model contract", () => {
  const baseline = calculateCashFlowModel(INITIAL_EVIDENCE);
  const halfScale = calculateCashFlowModel(INITIAL_EVIDENCE, 600);

  assert.equal(halfScale.assumptions.capacityMW, 600);
  assert.equal(halfScale.assumptions.electricityRate, baseline.assumptions.electricityRate);
  assert.ok(halfScale.assumptions.annualRevenueAtFullUtilization < baseline.assumptions.annualRevenueAtFullUtilization);
  assert.equal(halfScale.lineItems.electricity_cost.id, "electricity_cost");
});
