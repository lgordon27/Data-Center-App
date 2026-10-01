import fixtureDataFile from "../../server/fixtures/expected-evidence-cases.json" with { type: "json" };
import {
  createProjectIdentity,
  deriveProofLedgerProjection,
  validateProofLedgerEvent,
  type EvidenceObservation,
  type ProofLedgerEvent,
  type ProjectScope,
  type ProjectStateRecord,
  type SafeLocProofDimension,
  type StoredProofLedgerEvent,
} from "./safelocProofContract.js";
import {
  SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
  expectedEvidenceApplicabilityStateKey,
  type ExpectedEvidenceProfile,
} from "./expectedEvidence.js";

export type ExpectedEvidenceFixtureCase = {
  name: string;
  projectReference: string;
  projectName: string;
  scope: ProjectScope;
  profile: Omit<ExpectedEvidenceProfile, "project">;
  supportedDimensions: SafeLocProofDimension[];
  conflictingDimensions: SafeLocProofDimension[];
  completeNotFoundDimensions: SafeLocProofDimension[];
  incompleteSearchDimensions: SafeLocProofDimension[];
  notApplicableDimensions: SafeLocProofDimension[];
  facilityLifecycle: string | null;
  powerDelivery: string | null;
};

export const EXPECTED_EVIDENCE_FIXTURE_DATA = fixtureDataFile as unknown as {
  fixtureStatus: string;
  policyVersion: number;
  cases: ExpectedEvidenceFixtureCase[];
};

export const EXPECTED_EVIDENCE_FIXTURE_VERSIONS = {
  schemaVersion: 1,
  policyVersion: 1,
  modelVersion: null,
} as const;

export const EXPECTED_EVIDENCE_FIXTURE_AS_OF = "2026-04-01T00:00:00.000Z";

export const ILLUSTRATIVE_EXPECTED_EVIDENCE_PASSAGES: Record<
  SafeLocProofDimension,
  { claim: string; value: string; qualifier: string; passage: string }
> = {
  "project-identity": {
    claim: "The planning record identifies the proposed data center and its facility scope.",
    value: "One named facility in the illustrative campus.",
    qualifier: "Illustrative identity record",
    passage: "The local planning record describes the proposed data center facility and identifies the site boundary.",
  },
  "power-grid-interconnection": {
    claim: "The facility's utility interconnection queue status.",
    value: "The load request entered the utility interconnection queue.",
    qualifier: "Illustrative utility queue update",
    passage: "The project's load request entered the utility interconnection queue in March 2026; required network upgrades remain under study.",
  },
  "electricity-tariff": {
    claim: "The applicable utility tariff and demand charges.",
    value: "Illustrative filed rate schedule applies to the facility.",
    qualifier: "Illustrative tariff filing",
    passage: "The utility filing describes the applicable demand and energy charges for the named service territory.",
  },
  "water-cooling": {
    claim: "The facility cooling design and process-water allocation.",
    value: "Illustrative cooling-water allocation is under review.",
    qualifier: "Illustrative water authority record",
    passage: "The water authority record discusses the facility's cooling demand, source allocation, and discharge requirements.",
  },
  "land-site-civil": {
    claim: "Site control and civil preparation for the facility.",
    value: "Illustrative parcel and grading information.",
    qualifier: "Illustrative planning record",
    passage: "The site plan identifies the project parcel and describes grading and access-road work.",
  },
  "permitting-entitlement": {
    claim: "Permit and entitlement status for the named phase.",
    value: "Illustrative permit application filed.",
    qualifier: "Illustrative authority docket",
    passage: "The permitting authority docket records an application for the named phase and lists the remaining review conditions.",
  },
  "community-local-government": {
    claim: "Local government action on the project.",
    value: "Illustrative public hearing record.",
    qualifier: "Illustrative city council minutes",
    passage: "City council minutes record the public hearing and the conditions attached to the development agreement.",
  },
  "environmental-air-generation": {
    claim: "Environmental review and on-site generation permit status.",
    value: "Illustrative air permit review.",
    qualifier: "Illustrative regulator notice",
    passage: "The environmental regulator notice describes emissions limits and the review of standby generation equipment.",
  },
  "climate-operational-hazard": {
    claim: "Site-specific flood and heat exposure.",
    value: "Illustrative hazard assessment.",
    qualifier: "Illustrative engineering review",
    passage: "The site assessment identifies flood exposure and extreme-heat design conditions for the facility.",
  },
  "construction-phasing": {
    claim: "Phase 1 construction progress and commissioning schedule.",
    value: "Construction work is underway on Phase 1.",
    qualifier: "Illustrative current construction update",
    passage: "Site work is underway on Phase 1, with commissioning expected in 2027.",
  },
  "financing-capital": {
    claim: "Project-level capital funding and committed debt.",
    value: "Illustrative financing package reported.",
    qualifier: "Illustrative lender disclosure",
    passage: "The lender disclosure summarizes the project financing package and the conditions for later draws.",
  },
  "tenant-counterparty": {
    claim: "Tenant and contracted capacity for the facility.",
    value: "Illustrative customer capacity commitment.",
    qualifier: "Illustrative company disclosure",
    passage: "The company disclosure describes contracted customer capacity and the term of the service arrangement.",
  },
  "incentives-taxes": {
    claim: "Local tax incentive conditions for the facility.",
    value: "Illustrative award agreement.",
    qualifier: "Illustrative public award notice",
    passage: "The public award notice describes the tax incentive, performance obligations, and clawback conditions.",
  },
};

export function makeIllustrativeEvidenceObservation(
  project: ReturnType<typeof createProjectIdentity>,
  dimension: SafeLocProofDimension,
  evidenceId: string,
  conflictsWithEvidenceIds: string[] = [],
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"] = "Model Inference",
): EvidenceObservation {
  const passage = ILLUSTRATIVE_EXPECTED_EVIDENCE_PASSAGES[dimension];
  return {
    evidenceId,
    project,
    dimension,
    claim: passage.claim,
    value: passage.value,
    unit: null,
    valueStatus: sourceQualityClassification === "Verified Evidence" || sourceQualityClassification === "Management Assertion"
      ? "actual"
      : "estimate",
    developmentQualifier: passage.qualifier,
    publicationDate: "2026-03-01",
    asOfDate: "2026-02-28",
    retainedPassageId: `passage-${evidenceId}`,
    retainedPassage: `Illustrative source excerpt: ${passage.passage}`,
    sourceIds: [`source-${evidenceId}`],
    sourceQualityClassification,
    eligibility: { eligible: true, reason: "Illustrative test fixture only." },
    conflictsWithEvidenceIds,
    supersedesEvidenceIds: [],
    researchRunId: null,
    observedAt: "2026-03-02T00:00:00.000Z",
  };
}

function addFixtureEvent(
  events: StoredProofLedgerEvent[],
  project: ReturnType<typeof createProjectIdentity>,
  eventId: string,
  eventType: ProofLedgerEvent["eventType"],
  payload: ProofLedgerEvent["payload"],
): void {
  const item = {
    eventId,
    project,
    effectiveAt: "2026-03-02T00:00:00.000Z",
    recordedAt: "2026-03-02T00:00:01.000Z",
    researchRunId: null,
    versions: EXPECTED_EVIDENCE_FIXTURE_VERSIONS,
    decisionRef: null,
    eventType,
    payload,
  } as StoredProofLedgerEvent;
  validateProofLedgerEvent(item);
  events.push(item);
}

export function storedIllustrativeEvidenceEvent(
  observation: EvidenceObservation,
  eventId: string,
  recordedAt: string,
  effectiveAt = observation.observedAt,
): StoredProofLedgerEvent {
  const item: StoredProofLedgerEvent = {
    eventId,
    eventType: "evidence-observation",
    project: observation.project,
    effectiveAt,
    recordedAt,
    researchRunId: observation.researchRunId,
    versions: EXPECTED_EVIDENCE_FIXTURE_VERSIONS,
    decisionRef: null,
    payload: { evidence: observation },
  };
  validateProofLedgerEvent(item);
  return item;
}

export function storedIllustrativeStateEvent(
  state: ProjectStateRecord,
  eventId: string,
  recordedAt: string,
): StoredProofLedgerEvent {
  const item: StoredProofLedgerEvent = {
    eventId,
    eventType: "project-state-change",
    project: state.project,
    effectiveAt: recordedAt,
    recordedAt,
    researchRunId: null,
    versions: EXPECTED_EVIDENCE_FIXTURE_VERSIONS,
    decisionRef: null,
    payload: { state },
  };
  validateProofLedgerEvent(item);
  return item;
}

export function createExpectedEvidenceFixtureProjection(
  fixture: ExpectedEvidenceFixtureCase,
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"] = "Model Inference",
) {
  if (EXPECTED_EVIDENCE_FIXTURE_DATA.fixtureStatus !== "illustrative") {
    throw new Error("Expected-evidence UI fixtures must remain explicitly illustrative.");
  }
  if (EXPECTED_EVIDENCE_FIXTURE_DATA.policyVersion !== SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION) {
    throw new Error("Expected-evidence UI fixture policy version is stale.");
  }

  const project = createProjectIdentity({
    projectReference: fixture.projectReference,
    name: fixture.projectName,
    scope: fixture.scope,
  });
  const profile: ExpectedEvidenceProfile = { ...fixture.profile, project };
  const events: StoredProofLedgerEvent[] = [];

  for (const dimension of fixture.supportedDimensions) {
    addFixtureEvent(events, project, `evidence-${dimension}`, "evidence-observation", {
      evidence: makeIllustrativeEvidenceObservation(
        project,
        dimension,
        `${fixture.projectReference}-${dimension}`,
        [],
        sourceQualityClassification,
      ),
    });
  }
  for (const dimension of fixture.conflictingDimensions) {
    const firstId = `${fixture.projectReference}-${dimension}-a`;
    const secondId = `${fixture.projectReference}-${dimension}-b`;
    addFixtureEvent(events, project, `evidence-${dimension}-a`, "evidence-observation", {
      evidence: makeIllustrativeEvidenceObservation(project, dimension, firstId, [secondId], sourceQualityClassification),
    });
    addFixtureEvent(events, project, `evidence-${dimension}-b`, "evidence-observation", {
      evidence: makeIllustrativeEvidenceObservation(project, dimension, secondId, [], sourceQualityClassification),
    });
  }
  for (const dimension of fixture.completeNotFoundDimensions) {
    addFixtureEvent(events, project, `search-complete-${dimension}`, "search-assessment", {
      search: {
        searchId: `search-complete-${fixture.projectReference}-${dimension}`,
        project,
        dimension,
        state: "complete",
        resolution: "searched-not-found",
        reason: "Illustrative fixture completed its planned search.",
        queryIds: [`query-${dimension}`],
        researchRunId: null,
        observedAt: "2026-03-02T00:00:00.000Z",
      },
    });
  }
  for (const dimension of fixture.incompleteSearchDimensions) {
    addFixtureEvent(events, project, `search-partial-${dimension}`, "search-assessment", {
      search: {
        searchId: `search-partial-${fixture.projectReference}-${dimension}`,
        project,
        dimension,
        state: "partial",
        resolution: "not-assessed",
        reason: "Illustrative fixture search is incomplete.",
        queryIds: [`query-${dimension}`],
        researchRunId: null,
        observedAt: "2026-03-02T00:00:00.000Z",
      },
    });
  }
  for (const dimension of fixture.notApplicableDimensions) {
    const state: ProjectStateRecord = {
      project,
      stateKey: expectedEvidenceApplicabilityStateKey(dimension),
      state: {
        status: "not-applicable",
        value: null,
        reason: "Explicit illustrative fixture state; never inferred from missing evidence.",
      },
      supportingEvidenceIds: [],
      stateVersion: "fixture-state-v1",
      asOfDate: "2026-03-02",
    };
    addFixtureEvent(events, project, `state-not-applicable-${dimension}`, "project-state-change", { state });
  }
  if (fixture.facilityLifecycle) {
    const state: ProjectStateRecord = {
      project,
      stateKey: "facility-lifecycle",
      state: { status: "known", value: fixture.facilityLifecycle },
      supportingEvidenceIds: [`${fixture.projectReference}-construction-phasing`],
      stateVersion: "fixture-state-v1",
      asOfDate: "2026-03-02",
    };
    addFixtureEvent(events, project, "state-facility-lifecycle", "project-state-change", { state });
  }
  if (fixture.powerDelivery) {
    const state: ProjectStateRecord = {
      project,
      stateKey: "power-delivery",
      state: { status: "known", value: fixture.powerDelivery },
      supportingEvidenceIds: [`${fixture.projectReference}-power-grid-interconnection`],
      stateVersion: "fixture-state-v1",
      asOfDate: "2026-03-02",
    };
    addFixtureEvent(events, project, "state-power-delivery", "project-state-change", { state });
  }

  return {
    project,
    profile,
    projection: deriveProofLedgerProjection(events, EXPECTED_EVIDENCE_FIXTURE_AS_OF),
  };
}