import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE, buildFinancialInputState } from "@/context/DiligenceContext";
import {
  calculateCashFlowModel,
  calculateIRR,
  calculateIRRResult,
  calculateMOIC,
  calculateNPV,
  calculatePayback,
  containEvidenceForModel,
  CLIMATE_QUALITY_MULTIPLIERS,
  DEFAULT_CAPACITY_MW,
  formatImpactDelta,
  MAX_CAPACITY_MW,
  MATERIAL_EVIDENCE_IDS,
  WATERFALL_RECONCILIATION_TOLERANCE,
  type Classification,
  type EvidenceRecord,
  type ReturnSensitivity,
} from "./cashFlowEngine";
import { sourceStateMap } from "@/data/sources";
import { createEiaFallback } from "@/services/eiaService";
import { FALLBACK_ERCOT_RESULT } from "@/services/ercotService";
import {
  createSanitizedReturnDiscrepancyRecord,
  type ReturnCaptureInput,
} from "@/diagnostics/returnDiscrepancyCapture";
import { buildFinancialScenarioMatrix } from "@/model/financialScenarioContract";

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
        modelClassification: undefined,
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

test("sanitized return captures preserve the replay contract without raw provider content", () => {
  const metrics = calculateCashFlowModel(INITIAL_EVIDENCE);
  const eiaData = createEiaFallback();
  const financialScenarios = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
  });
  const hostileRawPayload = {
    data: { private: "provider-secret" },
    responsePreview: { sourceText: "private source passage" },
    authorization: "Bearer provider-secret",
    cookie: "session=private-cookie",
    priceHistory: [{ period: "2026-01", pricePerMwh: 42 }],
  };
  const currentSession = JSON.stringify({
    version: 2,
    classifications: Object.fromEntries(
      Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [id, item.classification]),
    ),
    modelEvidence: INITIAL_EVIDENCE,
    hostileRawPayload,
  });
  const ercotQueue = {
    ...FALLBACK_ERCOT_RESULT,
    diagnostics: {
      ...FALLBACK_ERCOT_RESULT.diagnostics,
      responses: [hostileRawPayload],
      failedResponses: [hostileRawPayload],
      responsePreview: hostileRawPayload,
    },
  };
  const input: ReturnCaptureInput = {
    project: {
      kind: "curated",
      name: "Diligence test project",
      location: "Taylor County, TX",
      capacityMW: 1_200,
      description: "Synthetic test project description.",
    },
    originatingCompany: "Oracle",
    selectedProjectContext: null,
    scenarioClassifications: Object.fromEntries(
      Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [id, item.classification]),
    ),
    savedScenarioCount: 0,
    evidence: INITIAL_EVIDENCE,
    modelEvidence: INITIAL_EVIDENCE,
    metrics,
    financialScenarios,
    financialInputState: {
      basis: "fallback",
      providerStatus: "fallback",
      electricityRate: 42,
      electricityPeriod: null,
      sourceUpdatedAt: null,
    },
    sourceStates: sourceStateMap(),
    eiaData,
    ercotQueue,
    storage: {
      currentSession,
      scenarios: JSON.stringify({ scenarios: [], hostileRawPayload }),
      communityReview: JSON.stringify({ reviews: [], hostileRawPayload }),
      eiaCache: JSON.stringify(hostileRawPayload),
    },
    releaseIdentity: {
      applicationVersion: "test",
      releaseId: "test-release",
      commitSha: "test-commit",
      sourceCommitSha: "test-commit",
      deploymentId: null,
      buildTimestamp: "2026-09-17T00:00:00.000Z",
      assets: [{ file: "assets/app.js", hash: "sha256-test" }],
    },
  };

  const capture = createSanitizedReturnDiscrepancyRecord(input);
  assert.deepEqual(Object.keys(capture).sort(), [
    "captureSchemaVersion",
    "cashFlows",
    "classifications",
    "debtAndTerminalTreatment",
    "financialScenarios",
    "holding",
    "modelInputs",
    "project",
    "providerProvenance",
    "release",
    "returns",
    "scenario",
    "storage",
  ]);
  assert.deepEqual(Object.keys(capture.project).sort(), ["capacityMW", "description", "kind", "location", "name"]);
  assert.deepEqual(Object.keys(capture.holding).sort(), ["originatingCompany", "selectedProjectContext"]);
  assert.deepEqual(Object.keys(capture.scenario).sort(), ["classifications", "id", "kind", "savedScenarioCount"]);
  assert.deepEqual(Object.keys(capture.storage).sort(), ["localStorage", "schema", "sessionStorage"]);
  assert.deepEqual(Object.keys(capture.providerProvenance).sort(), ["eia", "ercotQueue", "sources"]);
  assert.deepEqual(Object.keys(capture.modelInputs).sort(), [
    "assumptions",
    "evidence",
    "financialInputState",
    "fingerprint",
  ]);
  assert.deepEqual(Object.keys(capture.returns).sort(), [
    "baseIRR",
    "cashOnCash",
    "confidenceScore",
    "equityInvested",
    "materialUnverifiedCount",
    "missingMaterialCount",
    "moic",
    "npv",
    "payback",
    "projectIRR",
    "recommendationBlocked",
    "recommendationStatus",
    "returnSensitivity",
    "totalDistributions",
    "unresolvedDecisionGateCount",
    "unresolvedFinancialDriverCount",
  ]);
  assert.deepEqual(Object.keys(capture.debtAndTerminalTreatment).sort(), [
    "amortizationYears",
    "annualPrincipalPayment",
    "debtAmount",
    "debtLtv",
    "interestRate",
    "schedule",
    "terminalDebtRepayment",
    "terminalFormula",
    "terminalValue",
  ]);
  assert.deepEqual(Object.keys(capture.release).sort(), ["fingerprint", "identity"]);

  const classificationIds = Object.keys(INITIAL_EVIDENCE).sort();
  assert.equal(classificationIds.length, 16);
  assert.deepEqual(Object.keys(capture.classifications).sort(), classificationIds);
  assert.deepEqual(Object.keys(capture.scenario.classifications).sort(), classificationIds);
  assert.deepEqual(Object.keys(capture.modelInputs.evidence).sort(), classificationIds);
  assert.match(capture.modelInputs.fingerprint, /^fnv1a-[0-9a-f]+$/);

  const forbiddenKeys = new Set([
    "apiKey",
    "authorization",
    "cookie",
    "cookies",
    "data",
    "failedResponses",
    "generationHistory",
    "payload",
    "priceHistory",
    "rawPayload",
    "response",
    "responsePreview",
    "responses",
    "sourceText",
    "token",
  ]);
  const forbiddenKeyPaths: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (forbiddenKeys.has(key)) forbiddenKeyPaths.push(childPath);
      visit(child, childPath);
    }
  };
  visit(capture, "capture");
  assert.deepEqual(forbiddenKeyPaths, []);
  const serializedCapture = JSON.stringify(capture);
  assert.doesNotMatch(serializedCapture, /provider-secret|private-cookie|private source passage|Bearer /i);
});

test("return metrics reject ambiguous IRRs while keeping NPV, MOIC, and payback explicit", () => {
  const sensitivityFixtures: Array<{ cashFlows: number[]; expectedIRR: number | null }> = [
    { cashFlows: [-100, 50, -10], expectedIRR: null },
    { cashFlows: [-100, 230, -132], expectedIRR: null },
    { cashFlows: [-100, -25, 250], expectedIRR: calculateIRR([-100, -25, 250]) },
  ];
  const sensitivityCells: ReturnSensitivity[] = sensitivityFixtures.map(({ cashFlows, expectedIRR }, index) => ({
    powerPriceMultiplier: [0.8, 1, 1.2][index],
    utilizationMultiplier: 1,
    irr: expectedIRR,
    moic: calculateMOIC(cashFlows),
  }));

  assert.equal(sensitivityCells[0].irr, null, "no-root sensitivity case must remain N/M");
  assert.equal(sensitivityCells[1].irr, null, "multiple-root sensitivity case must remain N/M");
  assert.notEqual(sensitivityCells[2].irr, null, "a negative interim contribution can still have one unique root");
  assert.equal(calculateIRR(sensitivityFixtures[0].cashFlows), null, "multiple sign changes do not bracket a unique economic root");
  assert.equal(calculateIRR(sensitivityFixtures[1].cashFlows), null, "10% and 20% are both valid roots, so IRR is not meaningful");
  const negativeInterim = sensitivityFixtures[2].cashFlows;
  const negativeInterimIRR = sensitivityCells[2].irr;
  assert.ok(Math.abs(calculateNPV(negativeInterim, negativeInterimIRR!)) < 0.000001);
  assert.equal(sensitivityCells[0].moic, 50 / 110);
  assert.equal(sensitivityCells[1].moic, 230 / 232);
  assert.equal(sensitivityCells[2].moic, 2);
  assert.equal(calculatePayback(sensitivityFixtures[0].cashFlows), null);
  assert.ok(Math.abs((calculatePayback(sensitivityFixtures[1].cashFlows) ?? 0) - (100 / 230)) < 0.000001);
  assert.equal(calculatePayback(negativeInterim), 1.5);

  const serializedCells = JSON.parse(JSON.stringify(sensitivityCells)) as ReturnSensitivity[];
  assert.equal(serializedCells[0].irr, null);
  assert.equal(serializedCells[1].irr, null);
  assert.equal(serializedCells[2].irr, negativeInterimIRR);

  const noSignChange = [-100, -25, -10];
  assert.equal(calculateIRR(noSignChange), null);
  assert.ok(calculateNPV(noSignChange, 0.1) < 0);
  assert.equal(calculateMOIC(noSignChange), 0);
  assert.equal(calculatePayback(noSignChange), null);
});

test("IRR results expose a typed mathematical reason without changing the nullable value", () => {
  assert.deepEqual(calculateIRRResult([-100, -25, -10]), {
    value: null,
    status: "not-meaningful",
    reason: "no-sign-change",
  });
  assert.deepEqual(calculateIRRResult([-100, 230, -132]), {
    value: null,
    status: "not-meaningful",
    reason: "multiple-roots",
  });
  assert.deepEqual(calculateIRRResult([-100, Number.NaN, 250]), {
    value: null,
    status: "not-meaningful",
    reason: "invalid-input",
  });
  const meaningful = calculateIRRResult([-100, -25, 250]);
  assert.equal(meaningful.status, "meaningful");
  assert.equal(meaningful.reason, null);
  assert.equal(meaningful.value, calculateIRR([-100, -25, 250]));
});

test("provider overlay state keeps each displayed IRR paired with its own reason", () => {
  const eiaData = createEiaFallback();
  const matrix = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
  });
  const state = buildFinancialInputState({
    projectKind: "curated",
    eiaLoading: false,
    matrix,
    eiaData,
  });

  assert.equal(state.syntheticBaselineIRR, matrix.scenarios["synthetic-verified"]!.returns.projectIRR);
  assert.equal(state.syntheticCurrentIRR, matrix.scenarios["synthetic-current"]!.returns.projectIRR);
  assert.equal(state.providerOverlayIRR, null);
  assert.equal(state.providerOverlayIRRReason, null);
});

test("custom research boundary quarantines incompatible units and source-free proposals", () => {
  const baseline = Object.fromEntries(
    Object.entries(allMissing()).map(([id, item]) => [
      id,
      { ...item, acceptedForModel: false, eligibleForModel: false, researchState: "retrieved-lead" },
    ]),
  ) as EvidenceRecord;
  const unsafe = {
    ...baseline,
    electricity_cost: {
      ...baseline.electricity_cost,
      value: 7.3,
      numericValue: 7.3,
      unit: "cents/kWh",
      acceptedForModel: true,
      eligibleForModel: true,
      researchState: "accepted",
    },
    grid_interconnection: {
      ...baseline.grid_interconnection,
      value: 1_200,
      numericValue: 1_200,
      unit: "MW",
      acceptedForModel: true,
      eligibleForModel: true,
      researchState: "accepted",
    },
  };
  const boundary = containEvidenceForModel(unsafe);
  assert.ok(boundary.quarantined.electricity_cost.some((reason) => /source|classification/i.test(reason)));
  assert.ok(boundary.quarantined.grid_interconnection.some((reason) => /unit/i.test(reason)));
  assert.deepEqual(calculateCashFlowModel(unsafe), calculateCashFlowModel(baseline));
  for (const classification of ["Management Assertion", "Model Inference", "User Assumption"] as const) {
    const sourceFree = {
      ...baseline,
      electricity_cost: {
        ...baseline.electricity_cost,
        value: 900,
        numericValue: 900,
        unit: "$/MWh",
        classification,
        acceptedForModel: false,
        eligibleForModel: false,
        researchState: "quarantined",
      },
    };
    assert.deepEqual(
      calculateCashFlowModel(sourceFree),
      calculateCashFlowModel(baseline),
      `${classification} must not change custom economics before acceptance`,
    );
  }
});

test("synthetic return calibration separates verified, default, and all-missing cases", () => {
  const verified = calculateCashFlowModel(allVerified());
  const current = calculateCashFlowModel(INITIAL_EVIDENCE);
  const missing = calculateCashFlowModel(allMissing());

  assert.notEqual(verified.projectIRR, null);
  assert.notEqual(current.projectIRR, null);
  assert.notEqual(missing.projectIRR, null);
  assert.ok(verified.projectIRR! >= 13 && verified.projectIRR! <= 14);
  assert.ok(current.projectIRR! >= 8 && current.projectIRR! <= 11);
  assert.ok(missing.projectIRR! < 0);

  const defaultSpread = verified.projectIRR! - current.projectIRR!;
  assert.ok(defaultSpread >= 3 && defaultSpread <= 5);
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

test("backup power remains a decision gate without a cash-flow contingency", () => {
  const verified = allVerified();
  const reference = calculateCashFlowModel(classify(verified, "grid_interconnection", "Management Assertion"));

  for (const classification of CLASSIFICATIONS) {
    let evidence = classify(verified, "grid_interconnection", "Management Assertion");
    evidence = classify(evidence, "backup_power_capacity", classification);
    const model = calculateCashFlowModel(evidence);
    assert.equal(model.assumptions.backupPowerCapex, 0);
    assert.equal(model.schedule[5].backupPowerOpex, 0);
    assert.equal(model.projectIRR, reference.projectIRR);
  }
});

test("water access and resilience gates keep fixed economics while posture changes", () => {
  const verified = allVerified();
  const base = calculateCashFlowModel(verified);
  assert.equal(base.assumptions.waterSourceEscalationMultiplier, 1.5);
  assert.ok(Math.abs(base.assumptions.waterEscalationRate - 0.105) < 0.000001);
  assert.equal(base.assumptions.waterConversionCapex, 80);
  assert.equal(base.assumptions.waterRightsCostMultiplier, 1.5);
  for (const id of ["water_rights", "water_source_resilience"] as const) {
    for (const classification of CLASSIFICATIONS) {
      const model = calculateCashFlowModel(classify(verified, id, classification));
      assert.equal(model.projectIRR, base.projectIRR);
      assert.equal(model.assumptions.waterConversionCapex, 80);
    }
  }
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

test("impact semantics preserve precision without emitting signed zero", () => {
  assert.equal(formatImpactDelta(-0), "No adjustment at current classification");
  assert.equal(formatImpactDelta(0.004), "less than 0.01 pts up");
  assert.equal(formatImpactDelta(-0.004), "less than 0.01 pts down");
  assert.equal(formatImpactDelta(0.04), "+0.04 pts");
  assert.equal(formatImpactDelta(-0.04), "-0.04 pts");
  assert.equal(formatImpactDelta(0.14), "+0.1 pts");
});

test("the verified waterfall resets modeled classifications and reconciles to current IRR", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);
  const verified = calculateCashFlowModel(allVerified());
  const hazardStep = model.waterfall.find((step) => step.id === "site_hazard_exposure");

  assert.equal(model.baseIRR, verified.projectIRR);
  assert.equal(model.baseModel?.assumptions.adjustedHazardProbability, 0.05);
  assert.equal(model.waterfall.at(-1)?.after, model.projectIRR);
  assert.equal(model.waterfallClosureDelta, 0);
  assert.equal(model.waterfallReconciles, true);
  assert.ok(Math.abs(model.waterfallClosureDelta ?? Infinity) <= WATERFALL_RECONCILIATION_TOLERANCE);
  assert.equal(model.waterfall.length, 10);
  assert.ok(model.waterfall.every((step) => step.impactRole === "Financial Driver"));
  assert.equal(hazardStep?.impactRole, "Financial Driver");
  assert.ok((hazardStep?.deltaIRR ?? 0) < 0);
});

test("impact roles come from the audited taxonomy rather than rounded IRR output", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);

  assert.equal(model.lineItems.grid_interconnection.impactRole, "Financial Driver");
  assert.equal(
    model.lineItems.grid_interconnection.impactExplanation,
    "Financial stress case",
  );
  assert.equal(model.lineItems.permitting_timeline.impactRole, "Financial Driver");
  assert.equal(model.lineItems.backup_power_capacity.impactRole, "Decision Gate");
  assert.equal(model.lineItems.community_risk.impactRole, "Context Indicator");
  assert.equal(model.lineItems.water_escalation.impactRole, "Financial Driver");
  assert.equal(
    formatImpactDelta(model.lineItems.water_escalation.deltaIRR),
    "less than 0.01 pts down",
  );

  const gridReclassified = calculateCashFlowModel(
    classify(INITIAL_EVIDENCE, "grid_interconnection", "Management Assertion"),
  );
  assert.equal(gridReclassified.lineItems.backup_power_capacity.impactRole, "Decision Gate");
  assert.equal(gridReclassified.lineItems.backup_power_capacity.deltaIRR, 0);
  assert.equal(gridReclassified.waterfall.some((step) => step.id === "backup_power_capacity"), false);
});

test("impact treatments expose the finalized assumptions and update after reclassification", () => {
  const initial = calculateCashFlowModel(INITIAL_EVIDENCE);

  assert.equal(
    initial.lineItems.electricity_cost.impactTreatment,
    "Applied rate: $44.1/MWh.",
  );
  assert.equal(
    initial.lineItems.customer_concentration.impactTreatment,
    "Decision posture only; no financial adjustment is derived from this evidence item.",
  );
  assert.match(initial.lineItems.grid_interconnection.impactTreatment, /^Applied interconnection delay:/);
  assert.equal(
    initial.lineItems.backup_power_capacity.impactTreatment,
    "Decision posture only; no financial adjustment is derived from this evidence item.",
  );
  assert.ok(
    Object.values(initial.lineItems)
      .filter((item) => item.impactRole === "Financial Driver")
      .every((item) => item.impactTreatment.startsWith("Applied ")),
  );

  const electricityReclassified = calculateCashFlowModel(
    classify(INITIAL_EVIDENCE, "electricity_cost", "Missing Evidence"),
  );
  assert.equal(
    electricityReclassified.lineItems.electricity_cost.impactTreatment,
    "Applied rate: $50.4/MWh.",
  );

  const gridReclassified = calculateCashFlowModel(
    classify(INITIAL_EVIDENCE, "grid_interconnection", "Management Assertion"),
  );
  assert.equal(
    gridReclassified.lineItems.backup_power_capacity.impactTreatment,
    "Decision posture only; no financial adjustment is derived from this evidence item.",
  );
});

test("decision gates and context indicators never alter financial outputs", () => {
  const verified = allVerified();
  const baseline = calculateCashFlowModel(verified);
  const ids = ["backup_power_capacity", "water_rights", "customer_concentration", "water_source_resilience", "community_risk", "renewable_percentage"] as const;
  for (const id of ids) {
    for (const classification of CLASSIFICATIONS) {
      const model = calculateCashFlowModel(classify(verified, id, classification));
      assert.equal(model.projectIRR, baseline.projectIRR, `${id} must not change IRR`);
      assert.equal(model.npv, baseline.npv, `${id} must not change NPV`);
      assert.equal(model.moic, baseline.moic, `${id} must not change MOIC`);
      assert.equal(model.lineItems[id].deltaIRR, 0);
      assert.equal(model.waterfall.some((step) => step.id === id), false);
    }
  }
});

test("attribution contract reconciles marginal schedule effects and separates roles", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);
  const electricity = model.attribution.electricity_cost;
  assert.equal(electricity.impactRole, "Financial Driver");
  assert.equal(electricity.currentClassification, "User Assumption");
  assert.equal(electricity.baselineClassification, "Verified Evidence");
  assert.equal(electricity.affectedCashFlowLine, "Electricity OPEX");
  assert.equal(electricity.marginalAnnualDeltas.length, model.schedule.length);
  assert.equal(
    electricity.dollarImpact,
    electricity.marginalAnnualDeltas.reduce((total, delta) => total + delta, 0),
  );
  const finalYearIndex = model.schedule.length - 1;
  const repairedElectricity = calculateCashFlowModel({
    ...INITIAL_EVIDENCE,
    electricity_cost: {
      ...INITIAL_EVIDENCE.electricity_cost,
      classification: "Verified Evidence",
      modelClassification: undefined,
    },
  });
  assert.equal(
    electricity.annualEffect,
    model.schedule[finalYearIndex].electricityOpex - repairedElectricity.schedule[finalYearIndex].electricityOpex,
  );
  assert.equal(electricity.annualEffectBasis, "Recurring operating line; excludes terminal value and debt repayment.");
  assert.notEqual(electricity.annualEffect, electricity.marginalAnnualDeltas[finalYearIndex]);
  assert.equal(electricity.singleInputSensitivityIRR, model.lineItems.electricity_cost.deltaIRR);
  assert.equal(model.attribution.cooling_capex.annualEffect, 0);
  assert.equal(model.attribution.cooling_capex.annualEffectBasis, "Close treatment only; no recurring annual effect.");
  assert.equal(model.attribution.water_rights.impactRole, "Decision Gate");
  assert.equal(model.attribution.water_rights.affectedCashFlowLine, "Review gate");
  assert.equal(model.attribution.water_rights.dollarImpact, 0);
  assert.equal(model.attribution.water_rights.singleInputSensitivityIRR, 0);
  assert.equal(model.attribution.water_rights.hasDirectModeledEffect, false);
  assert.equal(model.attribution.community_risk.affectedCashFlowLine, "Context only");
  assert.equal(model.attribution.site_hazard_exposure.currentClassification, "Verified Evidence");
  assert.equal(model.attribution.site_hazard_exposure.modeledClassification, "Model Inference");
  assert.ok(model.attribution.site_hazard_exposure.singleInputSensitivityIRR! < 0);
});

test("marginal attribution stays distinct from sequential waterfall attribution", () => {
  const model = calculateCashFlowModel(INITIAL_EVIDENCE);
  const marginal = model.attribution.grid_interconnection.singleInputSensitivityIRR;
  const sequential = model.waterfall.find((step) => step.id === "grid_interconnection")?.deltaIRR;
  assert.notEqual(marginal, null);
  assert.notEqual(sequential, undefined);
  assert.equal(model.waterfall.at(-1)?.after, model.projectIRR);
  assert.ok(
    model.waterfall.some((step) => Math.abs(step.deltaIRR - (model.attribution[step.id]?.singleInputSensitivityIRR ?? 0)) > 0.000001),
    "at least one interacting driver should demonstrate why sequential waterfall deltas are not additive marginal sensitivities",
  );
});

test("marginal treatment uses the one-input repaired comparator when drivers interact", () => {
  const interactingEvidence = {
    ...INITIAL_EVIDENCE,
    downtime_cost: {
      ...INITIAL_EVIDENCE.downtime_cost,
      classification: "Missing Evidence" as const,
      modelClassification: "Missing Evidence" as const,
    },
  };
  const model = calculateCashFlowModel(interactingEvidence);
  const repairedHazard = calculateCashFlowModel({
    ...interactingEvidence,
    site_hazard_exposure: {
      ...interactingEvidence.site_hazard_exposure,
      classification: "Verified Evidence",
      modelClassification: undefined,
    },
  });
  const expectedTreatment = `Applied annual hazard probability: ${(repairedHazard.assumptions.adjustedHazardProbability * 100).toFixed(1)}%; climate disruption cost: $${(repairedHazard.assumptions.adjustedDowntimeCostPerDay / 1_000_000).toFixed(2)}M/day.`;
  assert.equal(model.attribution.site_hazard_exposure.baselineTreatment, expectedTreatment);
  assert.notEqual(
    model.attribution.site_hazard_exposure.baselineTreatment,
    calculateCashFlowModel(allVerified()).attribution.site_hazard_exposure.baselineTreatment,
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
    "water_rights",
    "customer_concentration",
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
  assert.equal(nonMaterialMissing.unresolvedDecisionGateCount, 0);
  assert.equal(nonMaterialMissing.unresolvedFinancialDriverCount, 1);
  assert.equal(nonMaterialMissing.materialUnverifiedCount, 0);

  const decisionGateMissing = calculateCashFlowModel(
    classify(allVerified(), "water_rights", "Missing Evidence"),
  );
  assert.equal(decisionGateMissing.unresolvedDecisionGateCount, 1);
  assert.equal(decisionGateMissing.unresolvedFinancialDriverCount, 0);
});

test("custom project capacity scales standardized economics without changing the model contract", () => {
  const baseline = calculateCashFlowModel(INITIAL_EVIDENCE);
  const doubleScale = calculateCashFlowModel(INITIAL_EVIDENCE, 2_000);

  assert.equal(doubleScale.assumptions.capacityMW, 2_000);
  assert.equal(doubleScale.assumptions.electricityRate, baseline.assumptions.electricityRate);
  assert.ok(doubleScale.assumptions.annualRevenueAtFullUtilization > baseline.assumptions.annualRevenueAtFullUtilization);
  assert.ok(doubleScale.assumptions.coolingCapex > baseline.assumptions.coolingCapex);
  assert.ok(doubleScale.schedule[2].revenue > baseline.schedule[2].revenue);
  assert.ok(doubleScale.schedule[2].electricityMwh > baseline.schedule[2].electricityMwh);
  assert.equal(doubleScale.lineItems.electricity_cost.id, "electricity_cost");
  assert.equal(calculateCashFlowModel(INITIAL_EVIDENCE, 0).assumptions.capacityMW, DEFAULT_CAPACITY_MW);
  assert.equal(calculateCashFlowModel(INITIAL_EVIDENCE, MAX_CAPACITY_MW + 1).assumptions.capacityMW, DEFAULT_CAPACITY_MW);
});

test("pre-tax equity cash-on-cash uses the actual close equity denominator", () => {
  const model = calculateCashFlowModel(allVerified());
  assert.equal(model.cashOnCashDenominator, model.initialInvestedEquity);
  assert.equal(model.initialInvestedEquity, Math.abs(model.schedule[0].netEquityCashFlow));
  assert.equal(
    model.cashOnCash,
    (model.annualPreTaxEquityCashFlow / model.cashOnCashDenominator) * 100,
  );
  assert.equal(model.assumptions.sourcesAndUses.sources.debt + model.assumptions.sourcesAndUses.sources.equity, model.assumptions.sourcesAndUses.uses.total);
  assert.equal(model.schedule[1].activeMonths, 0);
  assert.equal(model.schedule[1].debtService > 0, true);
  assert.equal(model.schedule[1].dscr, 0);
  assert.deepEqual(model.dscrMeaningfulYears, [2, 3, 4, 5]);
});

test("power price and utilization sensitivity returns a complete 3 by 3 grid", () => {
  const model = calculateCashFlowModel(allVerified());
  assert.equal(model.returnSensitivity.length, 9);
  assert.ok(model.returnSensitivity.some((cell) => cell.powerPriceMultiplier === 0.8 && cell.utilizationMultiplier === 1.2));
  assert.ok(model.returnSensitivity.some((cell) => cell.powerPriceMultiplier === 1.2 && cell.utilizationMultiplier === 0.8));
});
