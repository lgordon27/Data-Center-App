import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import { calculateCashFlowModel } from "./cashFlowEngine";
import {
  applyAcceptedProofInputsToFinancialEvidence,
  FINANCIAL_TRANSMISSION_POLICY_VERSION,
} from "./financialTransmission";
import { buildFinancialScenarioMatrix } from "./financialScenarioContract";
import {
  createProjectIdentity,
  deriveProofLedgerProjection,
  type EvidenceObservation,
  type ProofLedgerEvent,
  type ProjectIdentity,
  type StoredProofLedgerEvent,
} from "./safelocProofContract";
import { createEiaFallback } from "@/services/eiaService";

const project = createProjectIdentity({
  projectReference: "fixture-project",
  name: "Fixture project",
  scope: { kind: "facility", key: "facility-a" },
});

const versions = { schemaVersion: 1, policyVersion: 1, modelVersion: "fixture-model-v1" };
const fixedTime = "2026-09-10T12:00:00.000Z";

function fixture({
  inputId = "electricity_cost",
  dimension = "electricity-tariff",
  value = 30,
  unit = "USD/MWh",
  sourceValue = value,
  sourceUnit = unit,
  searchState = "complete",
  searchResolution = "supported",
  eligible = true,
  valueStatus = "actual",
  conflictsWithEvidenceIds = [],
  superseded = false,
  proposalStatus = "accepted",
  proposalPolicyVersion = FINANCIAL_TRANSMISSION_POLICY_VERSION,
  decisionRef = "decision-1",
  evidenceProject = project,
  asOfDate = "2026-08-31",
}: {
  inputId?: string;
  dimension?: EvidenceObservation["dimension"];
  value?: string | number;
  unit?: string;
  sourceValue?: string | number | null;
  sourceUnit?: string | null;
  searchState?: "complete" | "partial" | "not-run" | "blocked" | "failed";
  searchResolution?: "not-assessed" | "supported" | "searched-not-found" | "conflicting";
  eligible?: boolean;
  valueStatus?: EvidenceObservation["valueStatus"];
  conflictsWithEvidenceIds?: string[];
  superseded?: boolean;
  proposalStatus?: "proposed" | "accepted" | "rejected" | "withdrawn" | "superseded";
  proposalPolicyVersion?: number;
  decisionRef?: string | null;
  evidenceProject?: ProjectIdentity;
  asOfDate?: string | null;
} = {}) {
  const sourceDimension = dimension;
  const source: EvidenceObservation = {
    evidenceId: "evidence-1",
    project: evidenceProject,
    dimension: sourceDimension,
    claim: "Exact facility evidence fixture.",
    value: sourceValue,
    unit: sourceUnit,
    valueStatus,
    developmentQualifier: null,
    publicationDate: "2026-09-01",
    asOfDate,
    retainedPassageId: "passage-1",
    retainedPassage: "The retained source passage records the facility input.",
    sourceIds: ["source-1"],
    sourceQualityClassification: "Verified Evidence",
    eligibility: { eligible, reason: eligible ? "fixture eligible" : "fixture ineligible" },
    conflictsWithEvidenceIds,
    supersedesEvidenceIds: [],
    researchRunId: null,
    observedAt: fixedTime,
  };
  const proposal = {
    proposalId: "proposal-1",
    project,
    sourceEvidenceIds: ["evidence-1"],
    affectedVariable: inputId,
    currentValue: { value: sourceValue, unit: sourceUnit },
    proposedValue: { value, unit },
    mechanism: "Accepted facility evidence changes an explicitly mapped model input.",
    quantificationClass: "quantified" as const,
    formula: "Descriptive only; the versioned mapping policy controls conversion.",
    supportLevel: "strong" as const,
    status: proposalStatus,
    mappingPolicyVersion: proposalPolicyVersion,
  };
  const events: ProofLedgerEvent[] = [
    {
      eventId: "event-search",
      eventType: "search-assessment",
      project,
      effectiveAt: fixedTime,
      researchRunId: null,
      versions,
      decisionRef: null,
      payload: {
        search: {
          searchId: "search-1",
          project,
          dimension: sourceDimension,
          state: searchState,
          resolution: searchResolution,
          reason: null,
          queryIds: ["query-1"],
          researchRunId: null,
          observedAt: fixedTime,
        },
      },
    },
    {
      eventId: "event-evidence",
      eventType: "evidence-observation",
      project: evidenceProject,
      effectiveAt: fixedTime,
      researchRunId: null,
      versions,
      decisionRef: null,
      payload: { evidence: source },
    },
    {
      eventId: "event-proposal",
      eventType: "transmission-proposal",
      project,
      effectiveAt: fixedTime,
      researchRunId: null,
      versions,
      decisionRef: null,
      payload: { proposal },
    },
    {
      eventId: "event-input",
      eventType: "accepted-model-input",
      project,
      effectiveAt: fixedTime,
      researchRunId: null,
      versions,
      decisionRef,
      payload: {
        input: {
          inputId,
          sourceEvidenceId: "evidence-1",
          dimension: sourceDimension,
          value,
          unit,
          acceptanceReason: "Reviewer accepted the source-backed proposal.",
        },
      },
    },
  ];
  if (superseded) {
    events.push({
      eventId: "event-supersession",
      eventType: "supersession",
      project,
      effectiveAt: fixedTime,
      researchRunId: null,
      versions,
      decisionRef: null,
      payload: {
        supersededEvidenceId: "evidence-1",
        supersedingEvidenceId: "evidence-2",
        reason: "Fixture supersession.",
      },
    });
  }
  const stored = events.map((event, index) => ({
    ...event,
    recordedAt: new Date(Date.parse(fixedTime) + index).toISOString(),
  })) as StoredProofLedgerEvent[];
  return deriveProofLedgerProjection(stored, "2026-09-10T13:00:00.000Z");
}

test("only a decision-backed accepted proposal changes a whitelisted financial input", () => {
  const projection = fixture({ sourceValue: 42, value: 30 });
  const result = applyAcceptedProofInputsToFinancialEvidence({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
  });

  assert.deepEqual(result.appliedInputIds, ["electricity_cost"]);
  assert.deepEqual(result.ignoredInputReasons, {});
  assert.equal(result.evidence.electricity_cost.numericValue, 30);
  assert.equal(result.evidence.electricity_cost.rawValue, 42);
  assert.equal(result.evidence.electricity_cost.normalizedValue, 30);
  assert.equal(result.evidence.electricity_cost.unit, "USD/MWh");
  assert.match(result.evidence.electricity_cost.citation ?? "", /passage-1/);
  assert.match(result.evidence.electricity_cost.citation ?? "", /Reviewer accepted/);
  assert.equal(result.evidence.electricity_cost.classification, "User Assumption");
  assert.match(result.evidence.electricity_cost.sourceRole ?? "", /actual/);

  const before = calculateCashFlowModel(INITIAL_EVIDENCE);
  const after = calculateCashFlowModel(result.evidence);
  assert.notEqual(after.projectIRR, before.projectIRR);
});

test("explicit unit formulas normalize tariff, water, timeline, and cooling CAPEX inputs", () => {
  const cases = [
    ["electricity_cost", "electricity-tariff", 3, "cents/kWh", 30, "USD/MWh"],
    ["electricity_escalation", "electricity-tariff", 350, "basis points", 3.5, "%"],
    ["water_consumption", "water-cooling", 23_000_000, "gallons/year", 23, "Mgal/year"],
    ["water_escalation", "water-cooling", 0.05, "fraction", 5, "%"],
    ["grid_interconnection", "power-grid-interconnection", 2, "years", 24, "months"],
    ["cooling_capex", "water-cooling", 450_000, "USD thousands", 450, "USD millions"],
    ["permitting_timeline", "permitting-entitlement", 52, "weeks", 11.958932238193018, "months"],
    ["capacity_mw", "construction-phasing", 1.2, "GW", 1_200, "MW"],
  ] as const;

  for (const [inputId, dimension, value, unit, expectedValue, expectedUnit] of cases) {
    const result = applyAcceptedProofInputsToFinancialEvidence({
      evidence: INITIAL_EVIDENCE,
      project,
      projection: fixture({ inputId, dimension, value, unit }),
    });
    assert.deepEqual(result.appliedInputIds, [inputId]);
    assert.ok(Math.abs(Number(result.evidence[inputId].numericValue) - expectedValue) < 1e-9);
    assert.equal(result.evidence[inputId].unit, expectedUnit);
  }
});

test("unknown or unsupported targets remain non-effecting rather than receiving invented mappings", () => {
  for (const inputId of ["tenant_commencement", "general_capex", "cod_date"]) {
    const result = applyAcceptedProofInputsToFinancialEvidence({
      evidence: INITIAL_EVIDENCE,
      project,
      projection: fixture({ inputId, dimension: "construction-phasing" }),
    });
    assert.deepEqual(result.appliedInputIds, []);
    assert.match(result.ignoredInputReasons[inputId], /No whitelisted financial formula/);
    assert.deepEqual(result.evidence, INITIAL_EVIDENCE);
  }
});

test("unaccepted, unqualified, conflicting, stale-status, superseded, or unit-invalid inputs do not transmit", () => {
  const blocked = [
    fixture({ decisionRef: null }),
    fixture({ proposalStatus: "proposed" }),
    fixture({ proposalPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION + 1 }),
    fixture({ eligible: false }),
    fixture({ valueStatus: "unknown" }),
    fixture({ conflictsWithEvidenceIds: ["other-evidence"] }),
    fixture({ superseded: true }),
    fixture({ asOfDate: "2025-01-01" }),
    fixture({ searchState: "partial" }),
    fixture({ searchResolution: "conflicting" }),
    fixture({ unit: "unrecognized-unit" }),
  ];
  for (const projection of blocked) {
    const result = applyAcceptedProofInputsToFinancialEvidence({
      evidence: INITIAL_EVIDENCE,
      project,
      projection,
    });
    assert.deepEqual(result.appliedInputIds, []);
    assert.ok(result.ignoredInputReasons.electricity_cost);
    assert.equal(result.evidence.electricity_cost.numericValue, INITIAL_EVIDENCE.electricity_cost.numericValue);
  }
});

test("accepted proof changes the synthetic primary while EIA remains a distinct price sensitivity", () => {
  const eiaData = createEiaFallback();
  const baseline = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
  });
  const transmitted = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
    acceptedProofProjection: fixture({ value: 30 }),
    proofProject: project,
  });
  assert.equal(transmitted.primaryScenarioId, "synthetic-current");
  assert.notEqual(
    transmitted.scenarios["synthetic-current"]?.returns.projectIRR,
    baseline.scenarios["synthetic-current"]?.returns.projectIRR,
  );
  assert.equal(transmitted.scenarios["synthetic-verified"]?.inputs.appliedElectricityRate, 30);
  assert.equal(transmitted.scenarios["synthetic-current"]?.transmission.acceptedInputs[0]?.currentValue.value, 42);
  assert.equal(transmitted.scenarios["synthetic-current"]?.transmission.acceptedInputs[0]?.proposedValue.value, 30);
  assert.equal(transmitted.scenarios["synthetic-current"]?.transmission.acceptedInputs[0]?.valueTreatment, "reviewer-adjusted");
  assert.deepEqual(
    transmitted.scenarios["synthetic-current"]?.transmission.acceptedInputs.map(({ inputId, proposalId, decisionRef }) => (
      { inputId, proposalId, decisionRef }
    )),
    [{ inputId: "electricity_cost", proposalId: "proposal-1", decisionRef: "decision-1" }],
  );
  const capacityOnly = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: null,
    acceptedProofProjection: fixture({
      inputId: "capacity_mw",
      dimension: "construction-phasing",
      value: 1.2,
      unit: "GW",
    }),
    proofProject: project,
  });
  assert.equal(capacityOnly.scenarios["synthetic-current"]?.assumptions.capacityMW, 1_200);
  assert.equal(capacityOnly.scenarios["synthetic-current"]?.transmission.acceptedInputs[0]?.acceptedValue.unit, "MW");
  assert.throws(() => buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
    acceptedProofProjection: fixture({ value: 30 }),
  }), /both a ledger projection and project identity/);
});