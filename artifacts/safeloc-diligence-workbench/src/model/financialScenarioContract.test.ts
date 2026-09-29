import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_DOSSIER_SCENARIOS,
  INITIAL_EVIDENCE,
  buildDossierModelEvidence,
  reviewCapacityClaim,
  reviewIllustrativeCapacity,
} from "@/context/DiligenceContext";
import { createEiaFallback, type EiaElectricityData } from "@/services/eiaService";
import type { EvidenceRecord } from "./cashFlowEngine";
import type { CapacityClaimCandidate } from "./assumptionBinding";
import {
  buildFinancialScenarioMatrix,
  type FinancialProviderState,
  type FinancialScenarioSnapshot,
} from "./financialScenarioContract";

const IRR_TOLERANCE = 1e-9;
const PROVIDER_RATE = 65.8;
const PROVIDER_ESCALATION = 3.4591194964446665;

function providerData(status: "live" | "cached"): EiaElectricityData {
  const fallback = createEiaFallback();
  return {
    ...fallback,
    status,
    dataOrigin: "provider",
    fetchedAt: "2026-09-17T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    latestPrice: PROVIDER_RATE,
    latestPricePeriod: "2026-08",
    yoyChangePercent: PROVIDER_ESCALATION,
    sourceMetadata: {
      ...fallback.sourceMetadata,
      status,
      dataOrigin: "provider",
      fetchedAt: "2026-09-17T12:00:00.000Z",
      sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    },
  };
}

function providerEvidence(): EvidenceRecord {
  return {
    ...INITIAL_EVIDENCE,
    electricity_cost: {
      ...INITIAL_EVIDENCE.electricity_cost,
      value: PROVIDER_RATE,
      numericValue: PROVIDER_RATE,
    },
    electricity_escalation: {
      ...INITIAL_EVIDENCE.electricity_escalation,
      value: PROVIDER_ESCALATION,
      numericValue: PROVIDER_ESCALATION,
    },
  };
}

function assertCompleteSnapshot(snapshot: FinancialScenarioSnapshot) {
  assert.deepEqual(Object.keys(snapshot.returns).sort(), [
    "cashOnCash",
    "confidenceScore",
    "equityInvested",
    "moic",
    "npv",
    "payback",
    "projectIRR",
    "projectIRRReason",
    "projectIRRStatus",
    "returnSensitivity",
    "totalDistributions",
  ]);
  assert.ok(snapshot.schedule.length > 0);
  assert.deepEqual(snapshot.schedule, snapshot.model.schedule);
  assert.deepEqual(snapshot.assumptions, snapshot.model.assumptions);
  assert.deepEqual(snapshot.recommendation, {
    status: snapshot.model.recommendationStatus,
    blocked: snapshot.model.recommendationBlocked,
    missingMaterialCount: snapshot.model.missingMaterialCount,
    unresolvedDecisionGateCount: snapshot.model.unresolvedDecisionGateCount,
    unresolvedFinancialDriverCount: snapshot.model.unresolvedFinancialDriverCount,
    materialUnverifiedCount: snapshot.model.materialUnverifiedCount,
  });
  assert.match(snapshot.modelFingerprint, /^fnv1a-[0-9a-f]{8}$/);
}

test("four-scenario contract preserves the audited hierarchy and complete deterministic snapshots", () => {
  const eiaData = providerData("live");
  const input = {
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: providerEvidence(),
    eiaData,
    providerState: "live" as const,
    capacityMW: 1_200,
  };
  const matrix = buildFinancialScenarioMatrix(input);
  const repeated = buildFinancialScenarioMatrix(input);
  assert.deepEqual(repeated, matrix, "identical normalized inputs must produce identical models and fingerprints");
  assert.equal(matrix.primaryScenarioId, "synthetic-current");
  assert.equal(matrix.providerState, "live");

  const expected = {
    "synthetic-verified": {
      name: "Synthetic verified benchmark",
      role: "benchmark",
      evidenceBasis: "verified",
      electricityBasis: "synthetic",
      irr: 13.343171792288588,
    },
    "synthetic-current": {
      name: "Synthetic current-evidence case",
      role: "primary",
      evidenceBasis: "current",
      electricityBasis: "synthetic",
      irr: 9.086986530041251,
    },
    "eia-verified": {
      name: "EIA verified sensitivity",
      role: "sensitivity",
      evidenceBasis: "verified",
      electricityBasis: "eia",
      irr: 3.325065602263244,
    },
    "eia-current": {
      name: "EIA current-evidence sensitivity",
      role: "sensitivity",
      evidenceBasis: "current",
      electricityBasis: "eia",
      irr: -3.724864807480044,
    },
  } as const;

  for (const [id, contract] of Object.entries(expected)) {
    const snapshot = matrix.scenarios[id as keyof typeof expected];
    assert.ok(snapshot);
    assert.equal(snapshot.scenarioId, id);
    assert.equal(snapshot.name, contract.name);
    assert.equal(snapshot.role, contract.role);
    assert.equal(snapshot.evidenceBasis, contract.evidenceBasis);
    assert.equal(snapshot.electricityBasis, contract.electricityBasis);
    assert.ok(snapshot.returns.projectIRR !== null);
    assert.ok(
      Math.abs(snapshot.returns.projectIRR - contract.irr) <= IRR_TOLERANCE,
      `${id} IRR must match the audited deterministic output within ${IRR_TOLERANCE} percentage points; tolerance covers floating-point arithmetic only`,
    );
    assertCompleteSnapshot(snapshot);
  }

  const syntheticCurrent = matrix.scenarios["synthetic-current"]!;
  assert.equal(syntheticCurrent.inputs.rawElectricityRate, 42);
  assert.equal(syntheticCurrent.inputs.appliedElectricityRate, 44.1);
  assert.equal(syntheticCurrent.inputs.rawElectricityEscalationPercent, 6);
  assert.equal(syntheticCurrent.inputs.appliedElectricityEscalationPercent, 8);
  assert.equal(syntheticCurrent.provider.state, "not-applicable");
  assert.equal(syntheticCurrent.provider.dataOrigin, "not-applicable");

  const eiaCurrent = matrix.scenarios["eia-current"]!;
  assert.equal(eiaCurrent.inputs.rawElectricityRate, PROVIDER_RATE);
  assert.equal(eiaCurrent.inputs.appliedElectricityRate, PROVIDER_RATE * 1.05);
  assert.equal(eiaCurrent.inputs.rawElectricityEscalationPercent, PROVIDER_ESCALATION);
  assert.ok(
    Math.abs(eiaCurrent.inputs.appliedElectricityEscalationPercent - (PROVIDER_ESCALATION + 2)) <= Number.EPSILON * 4,
    "applied escalation may differ by one floating-point representation unit",
  );
  assert.deepEqual(eiaCurrent.provider, {
    state: "live",
    dataOrigin: "provider",
    period: "2026-08",
    fetchedAt: "2026-09-17T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    description: "U.S. EIA Texas statewide industrial retail electricity-price sensitivity; not a Stargate tariff or contracted project price.",
  });
});

test("provider lifecycle states never hide or replace the synthetic primary case", () => {
  const primaryFingerprints = new Set<string>();
  const states: FinancialProviderState[] = ["live", "cached", "refreshing", "embedded", "unavailable", "not-applicable"];
  for (const providerState of states) {
    const providerAvailable = providerState === "live" || providerState === "cached";
    const eiaData = providerAvailable ? providerData(providerState) : createEiaFallback();
    const matrix = buildFinancialScenarioMatrix({
      syntheticEvidence: INITIAL_EVIDENCE,
      providerEvidence: providerAvailable ? providerEvidence() : null,
      eiaData,
      providerState,
      capacityMW: 1_200,
    });
    const primary = matrix.scenarios["synthetic-current"];
    assert.ok(primary, `${providerState} must retain the primary synthetic scenario`);
    assert.equal(primary.role, "primary");
    assert.equal(primary.returns.projectIRR, 9.086986530041251);
    primaryFingerprints.add(primary.modelFingerprint);
    assert.equal(Boolean(matrix.scenarios["eia-current"]), providerAvailable);
    assert.equal(Boolean(matrix.scenarios["eia-verified"]), providerAvailable);
  }
  assert.equal(primaryFingerprints.size, 1, "provider lifecycle must not change the primary scenario fingerprint");
});

test("dossier classifications overlay provenance without replacing typed model inputs", () => {
  const baselineEvidence = INITIAL_EVIDENCE.electricity_cost;
  const modelEvidence = buildDossierModelEvidence({
    electricity_cost: {
      ...baselineEvidence,
      value: "Dossier narrative value",
      numericValue: 999,
      unit: "Dossier narrative unit",
      classification: "Verified Evidence",
      citation: "Dossier source citation",
      description: "Dossier source provenance.",
    },
  });
  const electricity = modelEvidence.electricity_cost;
  assert.equal(electricity.value, baselineEvidence.value);
  assert.equal(electricity.numericValue, baselineEvidence.numericValue);
  assert.equal(electricity.unit, baselineEvidence.unit);
  assert.equal(electricity.classification, "Verified Evidence");
  assert.equal(electricity.citation, "Dossier source citation");
  assert.equal(electricity.origin, "dossier");
  assert.equal(electricity.baselineClassification, "Verified Evidence");
  assert.equal(modelEvidence.water_consumption.origin, "synthetic-default");

  const classificationCounts = (evidence: Record<string, { classification: string }>) =>
    Object.values(evidence).reduce<Record<string, number>>((counts, item) => {
      counts[item.classification] = (counts[item.classification] ?? 0) + 1;
      return counts;
    }, {});
  const defaultCounts = classificationCounts(INITIAL_EVIDENCE);
  const dossierCounts = classificationCounts(modelEvidence);
  assert.equal(dossierCounts["Verified Evidence"], (defaultCounts["Verified Evidence"] ?? 0) + 1);
  assert.equal(dossierCounts["User Assumption"], (defaultCounts["User Assumption"] ?? 0) - 1);

  const eiaData = createEiaFallback();
  const makeMatrix = (syntheticEvidence: EvidenceRecord) => buildFinancialScenarioMatrix({
    syntheticEvidence,
    providerEvidence: null,
    eiaData,
    providerState: "unavailable",
    capacityMW: 1_200,
  });
  const defaultCurrent = makeMatrix(INITIAL_EVIDENCE).scenarios["synthetic-current"]!;
  const dossierCurrent = makeMatrix(modelEvidence).scenarios["synthetic-current"]!;
  assert.notEqual(dossierCurrent.returns.confidenceScore, defaultCurrent.returns.confidenceScore);
});

test("null capacity produces no scenarios and the approved dossier set stays explicit", () => {
  const matrix = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: providerEvidence(),
    eiaData: providerData("live"),
    providerState: "live",
    capacityMW: null,
  });
  assert.deepEqual(matrix.scenarios, {
    "synthetic-verified": null,
    "synthetic-current": null,
    "eia-verified": null,
    "eia-current": null,
  });
  assert.deepEqual(Object.keys(APPROVED_DOSSIER_SCENARIOS), ["stargate-abilene"]);
});

test("capacity review accept and reject actions preserve an auditable decision trail", () => {
  const candidate: CapacityClaimCandidate = {
    findingId: "finding-1",
    claim: {
      value: 180,
      unit: "MW",
      powerMeasure: "it-capacity",
      scope: { kind: "campus", campusId: "custom-campus" },
      status: "current",
      sourceTitle: "Capacity release",
      sourceUrl: "https://example.com/capacity",
      sourceDate: "2026-09-01",
      humanAccepted: false,
    },
  };
  const accepted = reviewCapacityClaim(null, "custom-project|west texas", candidate, "accepted", "2026-09-02T10:00:00.000Z");
  assert.equal(accepted.acceptedClaim?.humanAccepted, true);
  assert.equal(accepted.acceptedFindingId, "finding-1");
  assert.deepEqual(accepted.trail.map(({ action, findingId }) => [action, findingId]), [["accepted", "finding-1"]]);

  const rejected = reviewCapacityClaim(accepted, "custom-project|west texas", candidate, "rejected", "2026-09-03T10:00:00.000Z");
  assert.equal(rejected.acceptedClaim, null);
  assert.equal(rejected.acceptedFindingId, null);
  assert.deepEqual(rejected.trail.map(({ action }) => action), ["accepted", "rejected"]);

  const illustrative = reviewIllustrativeCapacity(rejected, "custom-project|west texas", 700, "2026-09-04T10:00:00.000Z");
  assert.equal(illustrative.decision, "rejected");
  assert.equal(illustrative.illustrativeCapacityMW, 700);
  assert.deepEqual(illustrative.trail.map(({ action }) => action), ["accepted", "rejected", "illustrative-set"]);
});