import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import { createEiaFallback, type EiaElectricityData } from "@/services/eiaService";
import type { EvidenceRecord } from "./cashFlowEngine";
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