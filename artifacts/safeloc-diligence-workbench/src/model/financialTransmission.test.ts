import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import { calculateCashFlowModel } from "./cashFlowEngine";
import {
  applyAcceptedProofInputsToFinancialEvidence,
  createFinancialTransmissionDecisionService,
  expectedAffectedVariable,
  FINANCIAL_TRANSMISSION_POLICY_VERSION,
  financialTransmissionFormulaDescription,
  generateFinancialTransmissionProposal,
  previewFinancialTransmissionProposal,
  type VerifiedFinancialDecisionContext,
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
const modelStart = { date: "2026-09-10", reference: "Approved underwriting start date" };

function supportedPassage(inputId: string, value: string | number, unit: string | null) {
  const quantity = `${value} ${unit ?? ""}`.trim();
  const subject: Record<string, string> = {
    electricity_cost: `electricity tariff`,
    electricity_escalation: `electricity escalation`,
    water_consumption: `annual water consumption`,
    water_escalation: `water escalation`,
    grid_interconnection: `grid interconnection timeline`,
    cooling_capex: `cooling CAPEX`,
    permitting_timeline: `permitting timeline`,
    capacity_mw: `facility IT load`,
    cod_date: `commercial operation date (COD)`,
    tenant_commencement_date: `tenant commencement date`,
    documented_direct_project_capex: `total direct project CAPEX`,
  };
  const suffix = inputId === "documented_direct_project_capex" ? " excluding contingency" : "";
  return `Fixture project ${project.scope.key} ${subject[inputId] ?? "facility input"} is ${quantity}${suffix}.`;
}

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
  evidenceId = "evidence-1",
  sourceQualityClassification = "Verified Evidence",
  retainedPassage,
  publicationDate = "2026-09-01",
  developmentQualifier = null,
  proposalFormula,
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
  evidenceId?: string;
  sourceQualityClassification?: EvidenceObservation["sourceQualityClassification"];
  retainedPassage?: string;
  publicationDate?: string | null;
  developmentQualifier?: string | null;
  proposalFormula?: string | null;
} = {}) {
  const sourceDimension = dimension;
  const source: EvidenceObservation = {
    evidenceId,
    project: evidenceProject,
    dimension: sourceDimension,
    claim: supportedPassage(inputId, sourceValue ?? value, sourceUnit),
    value: sourceValue,
    unit: sourceUnit,
    valueStatus,
    developmentQualifier,
    publicationDate,
    asOfDate,
    retainedPassageId: "passage-1",
    retainedPassage: retainedPassage ?? supportedPassage(inputId, sourceValue ?? value, sourceUnit),
    sourceIds: ["source-1"],
    sourceQualityClassification,
    eligibility: { eligible, reason: eligible ? "fixture eligible" : "fixture ineligible" },
    conflictsWithEvidenceIds,
    supersedesEvidenceIds: [],
    researchRunId: null,
    observedAt: fixedTime,
  };
  const proposal = {
    proposalId: "proposal-1",
    project,
    sourceEvidenceIds: [evidenceId],
    affectedVariable: expectedAffectedVariable(inputId as Parameters<typeof expectedAffectedVariable>[0]),
    currentValue: { value: sourceValue, unit: sourceUnit },
    proposedValue: { value, unit },
    mechanism: "Accepted facility evidence changes an explicitly mapped model input.",
    quantificationClass: "quantified" as const,
    formula: proposalFormula === undefined
      ? financialTransmissionFormulaDescription(
          inputId as Parameters<typeof expectedAffectedVariable>[0],
          inputId === "cod_date" || inputId === "tenant_commencement_date" ? modelStart : undefined,
        )
      : proposalFormula,
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
          sourceEvidenceId: evidenceId,
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
        supersededEvidenceId: evidenceId,
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

function mergeFixtures(...projections: ReturnType<typeof fixture>[]) {
  const events = projections.flatMap((projection, projectionIndex) =>
    projection.events.map((event) => ({
      ...event,
      eventId: `merged-${projectionIndex}-${event.eventId}`,
    })),
  );
  return deriveProofLedgerProjection(events, "2026-09-10T13:00:00.000Z");
}

function verifiedDecisionsFor(projection: ReturnType<typeof fixture>): VerifiedFinancialDecisionContext[] {
  return projection.events.flatMap((inputEvent) => {
    if (inputEvent.eventType !== "accepted-model-input" || !inputEvent.decisionRef) return [];
    const proposalEvent = projection.events.find((event) =>
      event.eventType === "transmission-proposal" &&
      event.payload.proposal.sourceEvidenceIds.includes(inputEvent.payload.input.sourceEvidenceId),
    );
    if (proposalEvent?.eventType !== "transmission-proposal") return [];
    return [{
      decisionId: inputEvent.decisionRef,
      project,
      actorKind: "authenticated" as const,
      action: "accept" as const,
      targetRef: proposalEvent.payload.proposal.proposalId,
    }];
  });
}

function applyFixture(
  args: Parameters<typeof applyAcceptedProofInputsToFinancialEvidence>[0],
  verifiedDecisions = verifiedDecisionsFor(args.projection as ReturnType<typeof fixture>),
) {
  return applyAcceptedProofInputsToFinancialEvidence({ ...args, verifiedDecisions });
}

function decisionServiceFor({
  projection,
  actor,
  repository,
  verifyDecision,
}: {
  projection: ReturnType<typeof fixture>;
  actor: { kind: "authenticated"; actorRef: string } | { kind: "anonymous-session"; sessionRef: string } | null;
  repository: {
    recordDecision: (decision: import("./safelocProofContract").ProofUserDecision) => Promise<void>;
    appendEvent: (event: ProofLedgerEvent) => Promise<StoredProofLedgerEvent>;
  };
  verifyDecision?: (decisionId: string) => Promise<VerifiedFinancialDecisionContext | null>;
}) {
  return createFinancialTransmissionDecisionService({
    resolveTrustedActor: async () => actor,
    transaction: {
      async withLockedProject(_project, operation) {
        return operation({
          projection,
          repository,
          verifyDecision: verifyDecision ?? (async () => null),
        });
      },
    },
  });
}

test("only a decision-backed accepted proposal changes a whitelisted financial input", () => {
  const projection = fixture({
    sourceValue: 42,
    value: 30,
    developmentQualifier: "Existing campus",
  });
  const result = applyFixture({
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
  assert.equal(result.appliedInputs[0]?.formulaId, "electricity_cost-unit-normalization-v1");
  assert.equal(result.appliedInputs[0]?.formulaVersion, 1);
  assert.equal(result.appliedInputs[0]?.sourceAsOfDate, "2026-08-31");
  assert.equal(result.appliedInputs[0]?.project.projectId, project.projectId);
  assert.deepEqual(result.appliedInputs[0]?.projectScope, project.scope);
  assert.equal(result.appliedInputs[0]?.sourceDevelopmentQualifier, "Existing campus");
  assert.equal(result.appliedInputs[0]?.searchObservedAt, fixedTime);
  assert.equal(result.appliedInputs[0]?.evidenceAgeDays, 10);
  assert.equal(result.appliedInputs[0]?.retainedPassageId, "passage-1");
  assert.deepEqual(result.appliedInputs[0]?.sourceIds, ["source-1"]);

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
    const result = applyFixture({
      evidence: INITIAL_EVIDENCE,
      project,
      projection: fixture({ inputId, dimension, value, unit }),
    });
    assert.deepEqual(result.appliedInputIds, [inputId], JSON.stringify(result.ignoredInputReasons));
    if (inputId === "capacity_mw") {
      assert.ok(Math.abs(Number(result.acceptedCapacityMW) - expectedValue) < 1e-9);
      assert.equal(result.appliedInputs[0]?.acceptedValue.unit, expectedUnit);
      assert.deepEqual(result.evidence, INITIAL_EVIDENCE, "capacity is transmitted separately, not inserted into financial evidence");
    } else {
      assert.ok(Math.abs(Number(result.evidence[inputId].numericValue) - expectedValue) < 1e-9);
      assert.equal(result.evidence[inputId].unit, expectedUnit);
    }
  }
});

test("accepted facility-total water and cooling CAPEX remain absolute at 600 MW while synthetic defaults scale", () => {
  const waterProjection = fixture({
    inputId: "water_consumption",
    dimension: "water-cooling",
    value: 30,
    unit: "Mgal/year",
    sourceValue: 30,
    sourceUnit: "Mgal/year",
  });
  const water = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: waterProjection });
  assert.equal(water.evidence.water_consumption.capacityBasis, "facility-absolute");
  assert.equal(
    calculateCashFlowModel(water.evidence, 600).assumptions.annualCoolingWaterMgal,
    30,
  );
  assert.equal(calculateCashFlowModel(INITIAL_EVIDENCE, 600).assumptions.annualCoolingWaterMgal, 17.25);

  const coolingProjection = fixture({
    inputId: "cooling_capex",
    dimension: "water-cooling",
    value: 600,
    unit: "USD millions",
    sourceValue: 600,
    sourceUnit: "USD millions",
  });
  const cooling = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: coolingProjection });
  assert.equal(cooling.evidence.cooling_capex.capacityBasis, "facility-absolute");
  assert.equal(
    calculateCashFlowModel(cooling.evidence, 600).assumptions.syntheticCoolingCapexReference,
    600,
  );
  assert.equal(calculateCashFlowModel(INITIAL_EVIDENCE, 600).assumptions.syntheticCoolingCapexReference, 225);
});

test("unknown or unsupported targets remain non-effecting rather than receiving invented mappings", () => {
  for (const inputId of ["tenant_commencement", "general_capex"]) {
    const result = applyFixture({
      evidence: INITIAL_EVIDENCE,
      project,
      projection: fixture({ inputId, dimension: "construction-phasing" }),
    });
    assert.deepEqual(result.appliedInputIds, []);
    assert.match(result.ignoredInputReasons[inputId], /No whitelisted financial formula/);
    assert.deepEqual(result.evidence, INITIAL_EVIDENCE);
  }
});

test("financial transmission requires passage-backed quantity, unit, facility and target coverage", () => {
  const electricityCases = [
    {
      label: "generic quantity and unit without the target measure",
      passage: "Fixture project reports 30 USD/MWh in an unrelated schedule.",
    },
    {
      label: "same measure attributed to another facility",
      passage: "Other facility electricity tariff is 30 USD/MWh.",
    },
  ];
  for (const { label, passage } of electricityCases) {
    const projection = fixture({ retainedPassage: passage });
    const result = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection });
    assert.deepEqual(result.appliedInputIds, [], label);
  }

  const acceptedITLoad = fixture({
    inputId: "capacity_mw",
    dimension: "construction-phasing",
    value: 350,
    unit: "MW",
    sourceValue: 350,
    sourceUnit: "MW",
    retainedPassage: "Fixture project facility-a has 350 MW of IT load.",
  });
  assert.deepEqual(
    applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: acceptedITLoad }).appliedInputIds,
    ["capacity_mw"],
  );
  for (const passage of [
    "Fixture project facility-a has 600 MW of utility interconnection capacity.",
    "Fixture project facility-a has 600 MW of nameplate capacity.",
    "Fixture project facility-a has 600 MW of utility capacity and 350 MW of IT load.",
  ]) {
    const projection = fixture({
      inputId: "capacity_mw",
      dimension: "construction-phasing",
      value: 600,
      unit: "MW",
      sourceValue: 600,
      sourceUnit: "MW",
      retainedPassage: passage,
    });
    assert.deepEqual(
      applyFixture({ evidence: INITIAL_EVIDENCE, project, projection }).appliedInputIds,
      [],
      passage,
    );
  }

  for (const passage of [
    "Fixture project facility-a direct project CAPEX is 8000 USD millions.",
    "Fixture project facility-a total direct project CAPEX for phase-one is 8000 USD millions excluding contingency.",
    "Fixture project facility-a total cooling-only direct project CAPEX is 8000 USD millions excluding contingency.",
    "Fixture project executive summary. Campus-wide total direct project CAPEX is 8000 USD millions excluding contingency.",
    "Fixture project facility-a campus-wide total direct project CAPEX is 8000 USD millions excluding contingency.",
  ]) {
    const projection = fixture({
      inputId: "documented_direct_project_capex",
      dimension: "financing-capital",
      value: 8_000,
      unit: "USD millions",
      sourceValue: 8_000,
      sourceUnit: "USD millions",
      retainedPassage: passage,
    });
    assert.deepEqual(
      applyFixture({ evidence: INITIAL_EVIDENCE, project, projection }).appliedInputIds,
      [],
      passage,
    );
  }

  const totalDirectCapex = fixture({
    inputId: "documented_direct_project_capex",
    dimension: "financing-capital",
    value: 8_000,
    unit: "USD millions",
    sourceValue: 8_000,
    sourceUnit: "USD millions",
    retainedPassage: "Fixture project facility-a total direct project CAPEX is 8000 USD millions excluding contingency.",
  });
  assert.deepEqual(
    applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: totalDirectCapex }).appliedInputIds,
    ["documented_direct_project_capex"],
  );
});

test("retained quantity and adjacent unit must normalize to the observation value", () => {
  const mismatchedTariff = fixture({
    sourceValue: 3,
    sourceUnit: "USD/MWh",
    value: 30,
    unit: "USD/MWh",
    retainedPassage: "Fixture project facility-a electricity tariff is 3 cents/kWh.",
  });
  assert.deepEqual(
    applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: mismatchedTariff }).appliedInputIds,
    [],
    "3 cents/kWh describes 30 USD/MWh, not the 3 USD/MWh observation",
  );

  const convertedTariff = fixture({
    sourceValue: 3,
    sourceUnit: "cents/kWh",
    value: 30,
    unit: "USD/MWh",
    retainedPassage: "Fixture project facility-a electricity tariff is 3 cents/kWh.",
  });
  const convertedResult = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: convertedTariff });
  assert.deepEqual(convertedResult.appliedInputIds, ["electricity_cost"]);
  assert.equal(convertedResult.evidence.electricity_cost.numericValue, 30);

  const mismatchedCapacity = fixture({
    inputId: "capacity_mw",
    dimension: "construction-phasing",
    value: 1,
    unit: "MW",
    sourceValue: 1,
    sourceUnit: "MW",
    retainedPassage: "Fixture project facility-a IT load is 1 GW.",
  });
  assert.deepEqual(
    applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: mismatchedCapacity }).appliedInputIds,
    [],
    "1 GW describes 1000 MW, not the 1 MW observation",
  );

  const mismatchedCapex = fixture({
    inputId: "documented_direct_project_capex",
    dimension: "financing-capital",
    value: 8_000,
    unit: "USD millions",
    sourceValue: 8_000,
    sourceUnit: "USD millions",
    retainedPassage: "Fixture project facility-a total direct project CAPEX is 8000 USD thousands excluding contingency.",
  });
  assert.deepEqual(
    applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: mismatchedCapex }).appliedInputIds,
    [],
    "8000 USD thousands describes 8 USD millions, not 8000 USD millions",
  );
});

test("COD and tenant commencement use explicit start-date formulas and maximum readiness, not additive delays", () => {
  const start = modelStart;
  const codProjection = fixture({
    inputId: "cod_date",
    dimension: "construction-phasing",
    value: "2028-03-31",
    unit: "date",
    sourceValue: "2028-03-31",
    sourceUnit: "date",
    evidenceId: "cod-evidence",
  });
  const tenantProjection = fixture({
    inputId: "tenant_commencement_date",
    dimension: "tenant-counterparty",
    value: "2027-10-01",
    unit: "date",
    sourceValue: "2027-10-01",
    sourceUnit: "date",
    evidenceId: "tenant-evidence",
  });
  const projection = mergeFixtures(codProjection, tenantProjection);
  const result = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
    modelStartDate: start,
  });

  assert.deepEqual(result.appliedInputIds, ["cod_date", "tenant_commencement_date"]);
  assert.equal(result.modelOverrides.readinessDates?.length, 2);
  assert.equal(result.modelOverrides.modelStartDate?.reference, start.reference);
  assert.ok(result.appliedInputs.every((input) =>
    input.formulaVersion === 1 &&
    input.retainedPassageId.length > 0 &&
    input.sourceAsOfDate === "2026-08-31" &&
    input.sourceValueStatus === "actual",
  ));
  assert.equal(result.appliedInputs[0]?.modelStartDate, start.date);
  assert.equal(result.appliedInputs[0]?.modelStartDateReference, start.reference);
  const base = calculateCashFlowModel(INITIAL_EVIDENCE);
  const modeled = calculateCashFlowModel(INITIAL_EVIDENCE, 1_200, result.modelOverrides);
  assert.equal(modeled.assumptions.codMonthsFromStart, 19);
  assert.equal(modeled.assumptions.tenantCommencementMonthsFromStart, 13);
  assert.equal(modeled.revenueDelayMonths, 19);
  assert.equal(base.revenueDelayMonths, 14);

  const replayFromStoredAnchor = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection: codProjection,
  });
  assert.deepEqual(replayFromStoredAnchor.appliedInputIds, ["cod_date"]);
  assert.deepEqual(replayFromStoredAnchor.modelOverrides.modelStartDate, start);
  const differentReplayAnchor = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection: codProjection,
    modelStartDate: { date: "2026-09-11", reference: "Different replay anchor" },
  });
  assert.deepEqual(differentReplayAnchor.appliedInputIds, []);
  assert.match(differentReplayAnchor.ignoredInputReasons.cod_date, /latest proposal/);
});

test("retained COD dates must bind to the COD milestone, not a tenant date in the same passage", () => {
  const ambiguousCod = fixture({
    inputId: "cod_date",
    dimension: "construction-phasing",
    value: "2028-10-01",
    unit: "date",
    sourceValue: "2028-10-01",
    sourceUnit: "date",
    retainedPassage: "Fixture project facility-a COD is 2027-10-01 and tenant commencement date is 2028-10-01.",
  });
  const result = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection: ambiguousCod });
  assert.deepEqual(result.appliedInputIds, []);
  assert.ok(result.ignoredInputReasons.cod_date);
});

test("qualified planned, forecast, and budget evidence can be explicitly accepted without relabeling it actual", () => {
  const plannedCod = fixture({
    inputId: "cod_date",
    dimension: "construction-phasing",
    value: "2028-03-31",
    unit: "date",
    sourceValue: "2028-03-31",
    sourceUnit: "date",
    evidenceId: "planned-cod-evidence",
    valueStatus: "forecast",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 planned COD is 2028-03-31.",
  });
  const plannedTenantDate = fixture({
    inputId: "tenant_commencement_date",
    dimension: "tenant-counterparty",
    value: "2028-10-01",
    unit: "date",
    sourceValue: "2028-10-01",
    sourceUnit: "date",
    evidenceId: "planned-tenant-date-evidence",
    valueStatus: "forecast",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 planned tenant commencement date is 2028-10-01.",
  });
  const budgetCapex = fixture({
    inputId: "documented_direct_project_capex",
    dimension: "financing-capital",
    value: 8_000,
    unit: "USD millions",
    sourceValue: 8_000,
    sourceUnit: "USD millions",
    evidenceId: "budget-capex-evidence",
    valueStatus: "estimate",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 budget estimate for total direct project CAPEX is 8000 USD millions excluding contingency.",
  });
  const plannedCapacity = fixture({
    inputId: "capacity_mw",
    dimension: "construction-phasing",
    value: 1_000,
    unit: "MW",
    sourceValue: 1,
    sourceUnit: "GW",
    evidenceId: "planned-capacity-evidence",
    valueStatus: "forecast",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 planned IT load is 1 GW.",
  });
  const coolingDesignWater = fixture({
    inputId: "water_consumption",
    dimension: "water-cooling",
    value: 23,
    unit: "Mgal/year",
    sourceValue: 23_000_000,
    sourceUnit: "gallons/year",
    evidenceId: "cooling-design-water-evidence",
    valueStatus: "estimate",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 cooling design annual water use is estimated at 23000000 gallons/year.",
  });
  const projection = mergeFixtures(plannedCod, plannedTenantDate, budgetCapex, plannedCapacity, coolingDesignWater);
  const result = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
    modelStartDate: modelStart,
  });

  assert.deepEqual(result.appliedInputIds.sort(), [
    "capacity_mw",
    "cod_date",
    "documented_direct_project_capex",
    "tenant_commencement_date",
    "water_consumption",
  ]);
  assert.deepEqual(
    Object.fromEntries(result.appliedInputs.map((input) => [input.inputId, input.sourceValueStatus])),
    {
      cod_date: "forecast",
      documented_direct_project_capex: "estimate",
      tenant_commencement_date: "forecast",
      capacity_mw: "forecast",
      water_consumption: "estimate",
    },
  );
  assert.match(result.evidence.water_consumption.sourceRole ?? "", /estimate/);
  assert.deepEqual(result.modelOverrides.modelStartDate, modelStart);
});

test("scoped direct project CAPEX is absolute, replaces overlapping cooling CAPEX, and leaves synthetic debt unchanged", () => {
  const capexProjection = fixture({
    inputId: "documented_direct_project_capex",
    dimension: "financing-capital",
    value: 8_000,
    unit: "USD millions",
    sourceValue: 8_000,
    sourceUnit: "USD millions",
    evidenceId: "direct-capex-evidence",
  });
  const coolingProjection = fixture({
    inputId: "cooling_capex",
    dimension: "water-cooling",
    value: 600,
    unit: "USD millions",
    sourceValue: 600,
    sourceUnit: "USD millions",
    evidenceId: "cooling-capex-evidence",
  });
  const projection = mergeFixtures(capexProjection, coolingProjection);
  const result = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
  });
  assert.deepEqual(result.appliedInputIds, ["documented_direct_project_capex"], JSON.stringify(result.ignoredInputReasons));
  assert.match(result.ignoredInputReasons.cooling_capex, /replaces the cooling component/);
  assert.equal(result.modelOverrides.directCapex?.scope, "facility-total-direct-capex-excluding-contingency");
  assert.equal(result.modelOverrides.directCapex?.amountUSDMillions, 8_000);
  assert.deepEqual(result.modelOverrides.directCapex?.sourceEvidenceIds, ["direct-capex-evidence"]);
  assert.equal(result.appliedInputs[0]?.formulaId, "absolute-facility-direct-capex-v1");
  assert.equal(result.evidence.cooling_capex.numericValue, INITIAL_EVIDENCE.cooling_capex.numericValue);

  const base = calculateCashFlowModel(INITIAL_EVIDENCE, 1_200);
  const modeled = calculateCashFlowModel(result.evidence, 1_200, result.modelOverrides);
  assert.equal(modeled.assumptions.documentedDirectCapex, 8_000);
  assert.equal(modeled.assumptions.directCapexScope, "facility-total-direct-capex-excluding-contingency");
  assert.equal(modeled.assumptions.coolingCapex, 0);
  assert.equal(modeled.assumptions.syntheticCoolingCapexReference, 450);
  assert.match(modeled.assumptions.capexContingencyBasis, /Documented direct CAPEX excludes contingency/);
  assert.equal(modeled.lineItems.cooling_capex.value, 0);
  assert.equal(modeled.assumptions.sourcesAndUses.uses.entryValue, 0);
  assert.equal(modeled.assumptions.sourcesAndUses.uses.coolingCapex, 0);
  assert.equal(modeled.assumptions.sourcesAndUses.uses.documentedDirectProjectCapex, 8_000);
  assert.equal(modeled.assumptions.debtAmount, base.assumptions.debtAmount);
  assert.match(modeled.assumptions.debtBasis, /Synthetic entry value/);

  const smallerFacility = calculateCashFlowModel(result.evidence, 600, result.modelOverrides);
  const smallerFacilityBase = calculateCashFlowModel(INITIAL_EVIDENCE, 600);
  assert.equal(smallerFacility.assumptions.documentedDirectCapex, 8_000);
  assert.equal(smallerFacility.assumptions.debtAmount, smallerFacilityBase.assumptions.debtAmount);
});

test("generated proposal previews use the whitelist, while anonymous decisions remain session-only", async () => {
  const projection = fixture({ sourceValue: 35, value: 30 });
  const currentMapping = applyFixture({ evidence: INITIAL_EVIDENCE, project, projection });
  const currentModel = calculateCashFlowModel(currentMapping.evidence, 1_200, currentMapping.modelOverrides);
  const proposal = generateFinancialTransmissionProposal({
    target: "electricity_cost",
    project,
    projection,
    sourceEvidenceId: "evidence-1",
    proposalId: "preview-proposal",
  });
  const initialEventCount = projection.events.length;
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.affectedVariable, "electricity_cost");
  assert.equal(proposal.proposedValue.value, 35);
  assert.equal(proposal.formula, financialTransmissionFormulaDescription("electricity_cost"));
  const preview = previewFinancialTransmissionProposal({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
    proposal,
    target: "electricity_cost",
    capacityMW: 1_200,
    allowGeneratedProposal: true,
    verifiedDecisions: verifiedDecisionsFor(projection),
  });
  assert.equal(preview.status, "preview-only");
  assert.ok(preview.projectIRRDelta !== 0);
  assert.equal(preview.before.projectIRR, currentModel.projectIRR);
  assert.equal(preview.before.assumptions.electricityRate, currentModel.assumptions.electricityRate);
  assert.notEqual(preview.after.assumptions.electricityRate, preview.before.assumptions.electricityRate);
  assert.equal(projection.events.length, initialEventCount);

  const proposedProjection = fixture({ proposalStatus: "proposed", decisionRef: null });
  const pendingProposal = proposedProjection.events.find((event) => event.eventType === "transmission-proposal");
  assert.equal(pendingProposal?.eventType, "transmission-proposal");
  if (pendingProposal?.eventType !== "transmission-proposal") throw new Error("Fixture proposal is missing.");
  const calls: string[] = [];
  const repository = {
    async recordDecision() {
      calls.push("decision");
    },
    async appendEvent(event: ProofLedgerEvent) {
      calls.push(event.eventType);
      return { ...event, recordedAt: fixedTime } as StoredProofLedgerEvent;
    },
  };
  const decide = decisionServiceFor({
    projection: proposedProjection,
    actor: { kind: "anonymous-session", sessionRef: "session-1" },
    repository,
  });
  const anonymousResult = await decide({
    project,
    proposal: pendingProposal.payload.proposal,
    target: "electricity_cost",
    action: "accept",
    decisionId: "anonymous-decision",
    acceptedInputEventId: "anonymous-accepted-input",
    proposalStatusEventId: "anonymous-proposal-status",
    rationale: "Reviewed in the current session.",
    acceptanceReason: "Source value is accepted for this session.",
    versions,
    decidedAt: fixedTime,
  });
  assert.equal(anonymousResult.persisted, false);
  assert.equal(anonymousResult.sessionOnly, true);
  assert.deepEqual(calls, []);
});

test("authenticated acceptance records a decision before the accepted input and proposal activation", async () => {
  const projection = fixture({ proposalStatus: "proposed", decisionRef: null });
  const pendingProposal = projection.events.find((event) => event.eventType === "transmission-proposal");
  if (pendingProposal?.eventType !== "transmission-proposal") throw new Error("Fixture proposal is missing.");
  const calls: string[] = [];
  let recordedDecision: import("./safelocProofContract").ProofUserDecision | null = null;
  const repository = {
    async recordDecision(decision: import("./safelocProofContract").ProofUserDecision) {
      recordedDecision = decision;
      calls.push(`decision:${decision.decisionId}`);
    },
    async appendEvent(event: ProofLedgerEvent) {
      calls.push(event.eventType);
      return { ...event, recordedAt: fixedTime } as StoredProofLedgerEvent;
    },
  };
  const decide = decisionServiceFor({
    projection,
    actor: { kind: "authenticated", actorRef: "reviewer-1" },
    repository,
    verifyDecision: async (decisionId) => recordedDecision?.decisionId === decisionId
      ? {
          decisionId,
          project,
          actorKind: "authenticated",
          action: "accept",
          targetRef: pendingProposal.payload.proposal.proposalId,
        }
      : null,
  });
  const result = await decide({
    project,
    proposal: pendingProposal.payload.proposal,
    target: "electricity_cost",
    action: "accept",
    decisionId: "reviewer-decision",
    acceptedInputEventId: "accepted-input-event",
    proposalStatusEventId: "accepted-proposal-status-event",
    rationale: "Reviewed against the retained facility source.",
    acceptanceReason: "The exact facility tariff is approved for this model input.",
    versions,
    decidedAt: fixedTime,
  });
  assert.equal(result.persisted, true);
  assert.deepEqual(calls, [
    "decision:reviewer-decision",
    "accepted-model-input",
    "transmission-proposal",
  ]);
  if (result.persisted && "inputEvent" in result) {
    assert.equal(result.inputEvent.decisionRef, "reviewer-decision");
  }
});

test("authenticated reviewers can accept qualified forecast dates, but conflicting replay anchors block every write", async () => {
  const forecastDateProposal = fixture({
    inputId: "cod_date",
    dimension: "construction-phasing",
    value: "2028-03-31",
    unit: "date",
    sourceValue: "2028-03-31",
    sourceUnit: "date",
    evidenceId: "forecast-cod-evidence",
    valueStatus: "forecast",
    developmentQualifier: "Phase 2",
    retainedPassage: "Fixture project facility-a Phase 2 planned COD is 2028-03-31.",
    proposalStatus: "proposed",
    decisionRef: null,
  });
  const proposalEvent = forecastDateProposal.events.find((event) => event.eventType === "transmission-proposal");
  if (proposalEvent?.eventType !== "transmission-proposal") throw new Error("Forecast proposal is missing.");
  const calls: string[] = [];
  let recordedDecision: import("./safelocProofContract").ProofUserDecision | null = null;
  const repository = {
    async recordDecision(decision: import("./safelocProofContract").ProofUserDecision) {
      recordedDecision = decision;
      calls.push("decision");
    },
    async appendEvent(event: ProofLedgerEvent) {
      calls.push(event.eventType);
      return { ...event, recordedAt: "2026-09-10T13:00:00.000Z" } as StoredProofLedgerEvent;
    },
  };
  const forecastService = decisionServiceFor({
    projection: forecastDateProposal,
    actor: { kind: "authenticated", actorRef: "reviewer-forecast" },
    repository,
    verifyDecision: async (decisionId) => recordedDecision?.decisionId === decisionId
      ? {
          decisionId,
          project,
          actorKind: "authenticated",
          action: "accept",
          targetRef: proposalEvent.payload.proposal.proposalId,
        }
      : null,
  });
  const forecastResult = await forecastService({
    project,
    proposal: proposalEvent.payload.proposal,
    target: "cod_date",
    action: "accept",
    decisionId: "forecast-decision",
    acceptedInputEventId: "forecast-input",
    proposalStatusEventId: "forecast-status",
    rationale: "The source-backed target date is qualified for Phase 2.",
    acceptanceReason: "Approved as a forecast, not an actual operating date.",
    versions,
    modelStartDate: modelStart,
    decidedAt: fixedTime,
  });
  assert.equal(forecastResult.persisted, true);
  assert.deepEqual(calls, ["decision", "accepted-model-input", "transmission-proposal"]);

  const existingCod = fixture({
    inputId: "cod_date",
    dimension: "construction-phasing",
    value: "2028-03-31",
    unit: "date",
    sourceValue: "2028-03-31",
    sourceUnit: "date",
    evidenceId: "existing-cod-evidence",
  });
  const proposedTenant = fixture({
    inputId: "tenant_commencement_date",
    dimension: "tenant-counterparty",
    value: "2028-10-01",
    unit: "date",
    sourceValue: "2028-10-01",
    sourceUnit: "date",
    evidenceId: "proposed-tenant-evidence",
    proposalStatus: "proposed",
    decisionRef: null,
    proposalFormula: financialTransmissionFormulaDescription(
      "tenant_commencement_date",
      { date: "2026-09-11", reference: "Different underwriting anchor" },
    ),
  });
  const combinedProjection = mergeFixtures(existingCod, proposedTenant);
  const tenantEvent = combinedProjection.events.find((event) =>
    event.eventType === "transmission-proposal" &&
    event.payload.proposal.affectedVariable === "tenant_commencement_date",
  );
  if (tenantEvent?.eventType !== "transmission-proposal") throw new Error("Tenant proposal is missing.");
  calls.length = 0;
  const conflictingService = decisionServiceFor({
    projection: combinedProjection,
    actor: { kind: "authenticated", actorRef: "reviewer-forecast" },
    repository,
    verifyDecision: async (decisionId) => decisionId === "decision-1"
      ? {
          decisionId,
          project,
          actorKind: "authenticated",
          action: "accept",
          targetRef: "proposal-1",
        }
      : recordedDecision?.decisionId === decisionId
        ? {
          decisionId,
          project,
          actorKind: "authenticated",
          action: "accept",
          targetRef: tenantEvent.payload.proposal.proposalId,
        }
        : null,
  });
  await assert.rejects(conflictingService({
    project,
    proposal: tenantEvent.payload.proposal,
    target: "tenant_commencement_date",
    action: "accept",
    decisionId: "conflicting-anchor-decision",
    acceptedInputEventId: "conflicting-anchor-input",
    proposalStatusEventId: "conflicting-anchor-status",
    rationale: "Reviewing a second readiness date.",
    acceptanceReason: "The proposal uses a different model-start anchor.",
    versions,
    modelStartDate: { date: "2026-09-11", reference: "Different underwriting anchor" },
    decidedAt: fixedTime,
  }), /prospective replay overlay|inconsistent replay anchors/);
  assert.deepEqual(calls, []);
});

test("canonical decisions require trusted auth, exact current proposal contents, and acceptance-range qualification", async () => {
  const projection = fixture({ proposalStatus: "proposed", decisionRef: null });
  const pendingProposalEvent = projection.events.find((event) => event.eventType === "transmission-proposal");
  if (pendingProposalEvent?.eventType !== "transmission-proposal") throw new Error("Fixture proposal is missing.");
  const calls: string[] = [];
  const repository = {
    async recordDecision() {
      calls.push("decision");
    },
    async appendEvent(event: ProofLedgerEvent) {
      calls.push(event.eventType);
      return { ...event, recordedAt: fixedTime } as StoredProofLedgerEvent;
    },
  };
  const request = {
    project,
    proposal: pendingProposalEvent.payload.proposal,
    target: "electricity_cost" as const,
    action: "accept" as const,
    decisionId: "blocked-decision",
    acceptedInputEventId: "blocked-input",
    proposalStatusEventId: "blocked-status",
    rationale: "Reviewer rationale.",
    acceptanceReason: "Accepted source-backed value.",
    versions,
    decidedAt: fixedTime,
  };

  const noAuthCapability = decisionServiceFor({
    projection,
    actor: null,
    repository,
  });
  await assert.rejects(noAuthCapability(request), /trusted server authentication capability/);
  assert.deepEqual(calls, []);

  const modifiedContents = decisionServiceFor({
    projection,
    actor: { kind: "authenticated", actorRef: "reviewer-1" },
    repository,
  });
  await assert.rejects(modifiedContents({
    ...request,
    proposal: { ...request.proposal, mechanism: "Changed after canonical proposal creation." },
  }), /exact latest proposed/);
  assert.deepEqual(calls, []);

  const staleEvent: StoredProofLedgerEvent = {
    ...pendingProposalEvent,
    eventId: "newer-proposal",
    recordedAt: "2026-09-10T12:00:05.000Z",
    payload: {
      proposal: {
        ...pendingProposalEvent.payload.proposal,
        proposalId: "newer-proposal",
        status: "proposed",
      },
    },
  };
  const staleSnapshotService = decisionServiceFor({
    projection: { ...projection, events: [...projection.events, staleEvent] },
    actor: { kind: "authenticated", actorRef: "reviewer-1" },
    repository,
  });
  await assert.rejects(staleSnapshotService(request), /exact latest proposed/);
  assert.deepEqual(calls, []);

  const excessiveWater = fixture({
    inputId: "water_consumption",
    dimension: "water-cooling",
    value: 1_000_001,
    unit: "Mgal/year",
    sourceValue: 1_000_001,
    sourceUnit: "Mgal/year",
    proposalStatus: "proposed",
    decisionRef: null,
  });
  const excessiveProposalEvent = excessiveWater.events.find((event) => event.eventType === "transmission-proposal");
  if (excessiveProposalEvent?.eventType !== "transmission-proposal") throw new Error("Fixture proposal is missing.");
  const rangeService = decisionServiceFor({
    projection: excessiveWater,
    actor: { kind: "authenticated", actorRef: "reviewer-1" },
    repository,
  });
  await assert.rejects(rangeService({
    ...request,
    proposal: excessiveProposalEvent.payload.proposal,
    target: "water_consumption",
  }), /whitelisted|range/i);
  assert.deepEqual(calls, []);
});

test("new rejected proposals and foreign-scope events cannot reactivate or replace older accepted inputs", () => {
  const base = fixture({ sourceValue: 42, value: 30 });
  const proposalEvent = base.events.find((event) => event.eventType === "transmission-proposal");
  const acceptedInputEvent = base.events.find((event) => event.eventType === "accepted-model-input");
  if (proposalEvent?.eventType !== "transmission-proposal" || acceptedInputEvent?.eventType !== "accepted-model-input") {
    throw new Error("Fixture proposal or accepted input is missing.");
  }
  const rejectedEvent: StoredProofLedgerEvent = {
    ...proposalEvent,
    eventId: "latest-rejected-proposal",
    recordedAt: "2026-09-10T12:00:05.000Z",
    payload: {
      proposal: {
        ...proposalEvent.payload.proposal,
        proposalId: "newer-rejected-proposal",
        status: "rejected",
      },
    },
  };
  const rejected = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection: { ...base, events: [...base.events, rejectedEvent] },
  });
  assert.deepEqual(rejected.appliedInputIds, []);
  assert.match(rejected.ignoredInputReasons.electricity_cost, /latest proposal/);
  assert.throws(() => previewFinancialTransmissionProposal({
    evidence: INITIAL_EVIDENCE,
    project,
    projection: { ...base, events: [...base.events, rejectedEvent] },
    proposal: proposalEvent.payload.proposal,
    target: "electricity_cost",
    capacityMW: 1_200,
  }), /superseded transmission proposal/);

  const foreignProject = createProjectIdentity({
    projectReference: "other-project",
    name: "Other project",
    scope: { kind: "facility", key: "facility-b" },
  });
  const foreignProposalEvent: StoredProofLedgerEvent = {
    ...rejectedEvent,
    eventId: "foreign-rejected-proposal",
    project: foreignProject,
    recordedAt: "2026-09-10T12:00:06.000Z",
    payload: {
      proposal: {
        ...rejectedEvent.payload.proposal,
        project: foreignProject,
      },
    },
  };
  const foreignInputEvent: StoredProofLedgerEvent = {
    ...acceptedInputEvent,
    eventId: "foreign-accepted-input",
    project: foreignProject,
    recordedAt: "2026-09-10T12:00:07.000Z",
    payload: {
      input: {
        ...acceptedInputEvent.payload.input,
        sourceEvidenceId: "foreign-evidence",
        value: 10,
      },
    },
  };
  const withForeignEvents = applyFixture({
    evidence: INITIAL_EVIDENCE,
    project,
    projection: {
      ...base,
      events: [...base.events, foreignProposalEvent, foreignInputEvent],
    },
  });
  assert.deepEqual(withForeignEvents.appliedInputIds, ["electricity_cost"]);
  assert.equal(withForeignEvents.evidence.electricity_cost.numericValue, 30);
});

test("unaccepted, unqualified, conflicting, stale-status, superseded, or unit-invalid inputs do not transmit", () => {
  const blocked = [
    fixture({ decisionRef: null }),
    fixture({ proposalStatus: "proposed" }),
    fixture({ proposalPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION + 1 }),
    fixture({ proposalFormula: "arbitrary-untrusted-formula-descriptor" }),
    fixture({ eligible: false }),
    fixture({ valueStatus: "unknown" }),
    fixture({ valueStatus: "forecast" }),
    fixture({ valueStatus: "estimate" }),
    fixture({
      valueStatus: "forecast",
      developmentQualifier: "Phase 2",
      retainedPassage: "Fixture project facility-a Phase 2 forecast electricity tariff is 30 USD/MWh.",
    }),
    fixture({ sourceQualityClassification: "User Assumption" }),
    fixture({ conflictsWithEvidenceIds: ["other-evidence"] }),
    fixture({ superseded: true }),
    fixture({ asOfDate: "2025-01-01" }),
    fixture({ publicationDate: "2026-10-01", asOfDate: "2026-08-31" }),
    fixture({ searchState: "partial" }),
    fixture({ searchState: "blocked" }),
    fixture({ searchState: "failed" }),
    fixture({ searchResolution: "conflicting" }),
    fixture({ searchResolution: "searched-not-found" }),
    fixture({ proposalStatus: "withdrawn" }),
    fixture({ unit: "unrecognized-unit" }),
    fixture({ sourceValue: "N/A", value: 30 }),
    fixture({
      inputId: "water_consumption",
      dimension: "water-cooling",
      value: 1_000_001,
      unit: "Mgal/year",
      sourceValue: 1_000_001,
      sourceUnit: "Mgal/year",
    }),
  ];
  for (const projection of blocked) {
    const result = applyFixture({
      evidence: INITIAL_EVIDENCE,
      project,
      projection,
    });
    assert.deepEqual(result.appliedInputIds, []);
    const target = projection.events.find((event) => event.eventType === "accepted-model-input");
    if (target?.eventType !== "accepted-model-input") throw new Error("Fixture input is missing.");
    assert.ok(result.ignoredInputReasons[target.payload.input.inputId]);
    if (target.payload.input.inputId === "electricity_cost") {
      assert.equal(result.evidence.electricity_cost.numericValue, INITIAL_EVIDENCE.electricity_cost.numericValue);
    }
  }
});

test("activation requires a verified authenticated decision for this exact proposal", () => {
  const projection = fixture();
  const withoutDecisionContext = applyAcceptedProofInputsToFinancialEvidence({
    evidence: INITIAL_EVIDENCE,
    project,
    projection,
  });
  assert.deepEqual(withoutDecisionContext.appliedInputIds, []);
  assert.match(withoutDecisionContext.ignoredInputReasons.electricity_cost, /verified authenticated acceptance decision/);

  const wrongProposalContext: VerifiedFinancialDecisionContext[] = [{
    decisionId: "decision-1",
    project,
    actorKind: "authenticated",
    action: "accept",
    targetRef: "older-proposal",
  }];
  const wrongTarget = applyFixture(
    { evidence: INITIAL_EVIDENCE, project, projection },
    wrongProposalContext,
  );
  assert.deepEqual(wrongTarget.appliedInputIds, []);
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
    acceptedProofProjection: fixture({ value: 30, sourceValue: 42 }),
    proofProject: project,
    verifiedFinancialDecisions: verifiedDecisionsFor(fixture({ value: 30, sourceValue: 42 })),
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
  assert.deepEqual(transmitted.transmission.appliedInputIds, ["electricity_cost"]);
  assert.equal(transmitted.transmission.acceptedInputs[0]?.searchResolution, "supported");
  assert.equal(transmitted.transmission.acceptedInputs[0]?.sourceAsOfDate, "2026-08-31");
  assert.equal(transmitted.transmission.acceptedInputs[0]?.formulaVersion, 1);
  assert.deepEqual(
    transmitted.scenarios["synthetic-current"]?.transmission.acceptedInputs.map(({ inputId, proposalId, decisionRef }) => (
      { inputId, proposalId, decisionRef }
    )),
    [{ inputId: "electricity_cost", proposalId: "proposal-1", decisionRef: "decision-1" }],
  );
  const capacityProjection = fixture({
    inputId: "capacity_mw",
    dimension: "construction-phasing",
    value: 1.2,
    unit: "GW",
  });
  const capacityOnly = buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: null,
    acceptedProofProjection: capacityProjection,
    proofProject: project,
    verifiedFinancialDecisions: verifiedDecisionsFor(capacityProjection),
  });
  assert.equal(capacityOnly.scenarios["synthetic-current"]?.assumptions.capacityMW, 1_200, JSON.stringify(capacityOnly.transmission.ignoredInputReasons));
  assert.equal(capacityOnly.scenarios["synthetic-current"]?.transmission.acceptedInputs[0]?.acceptedValue.unit, "MW");
  assert.deepEqual(capacityOnly.transmission.appliedInputIds, ["capacity_mw"]);
  assert.throws(() => buildFinancialScenarioMatrix({
    syntheticEvidence: INITIAL_EVIDENCE,
    providerEvidence: null,
    eiaData,
    providerState: "embedded",
    capacityMW: 1_200,
    acceptedProofProjection: fixture({ value: 30 }),
  }), /both a ledger projection and project identity/);
});