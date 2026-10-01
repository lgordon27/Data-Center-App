import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SAFELOC_PROOF_DIMENSIONS,
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
  type ExpectedEvidenceProfile,
  SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
  SAFELOC_EXPECTED_EVIDENCE_RULES,
  evaluateExpectedEvidence,
  expectedEvidenceApplicabilityStateKey,
  validateExpectedEvidenceProfile,
} from "./expectedEvidence.js";
import {
  EXPECTED_EVIDENCE_FIXTURE_DATA,
  createExpectedEvidenceFixtureProjection,
} from "./expectedEvidenceFixtureCases.js";

type FixtureCase = {
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

const fixtureData = JSON.parse(
  await readFile(new URL("../../server/fixtures/expected-evidence-cases.json", import.meta.url), "utf8"),
) as { fixtureStatus: string; policyVersion: number; cases: FixtureCase[] };
const VERSIONS = { schemaVersion: 1, policyVersion: 1, modelVersion: null };
const AS_OF = "2026-04-01T00:00:00.000Z";

const ILLUSTRATIVE_PASSAGES: Record<SafeLocProofDimension, { claim: string; value: string; qualifier: string; passage: string }> = {
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

function evidence(
  project: ReturnType<typeof createProjectIdentity>,
  dimension: SafeLocProofDimension,
  evidenceId: string,
  conflictsWithEvidenceIds: string[] = [],
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"] = "Model Inference",
): EvidenceObservation {
  const passage = ILLUSTRATIVE_PASSAGES[dimension];
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

function addEvent(
  events: StoredProofLedgerEvent[],
  project: ReturnType<typeof createProjectIdentity>,
  eventId: string,
  eventType: ProofLedgerEvent["eventType"],
  payload: ProofLedgerEvent["payload"],
): void {
  const base = {
    eventId,
    project,
    effectiveAt: "2026-03-02T00:00:00.000Z",
    recordedAt: "2026-03-02T00:00:01.000Z",
    researchRunId: null,
    versions: VERSIONS,
    decisionRef: null,
  };
  const item = { ...base, eventType, payload } as StoredProofLedgerEvent;
  validateProofLedgerEvent(item);
  events.push(item);
}

function storedEvidenceEvent(
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
    versions: VERSIONS,
    decisionRef: null,
    payload: { evidence: observation },
  };
  validateProofLedgerEvent(item);
  return item;
}

function storedStateEvent(
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
    versions: VERSIONS,
    decisionRef: null,
    payload: { state },
  };
  validateProofLedgerEvent(item);
  return item;
}

function createFixtureProjection(
  fixture: FixtureCase,
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"] = "Model Inference",
) {
  const project = createProjectIdentity({
    projectReference: fixture.projectReference,
    name: fixture.projectName,
    scope: fixture.scope,
  });
  const profile: ExpectedEvidenceProfile = { ...fixture.profile, project };
  const events: StoredProofLedgerEvent[] = [];
  for (const dimension of fixture.supportedDimensions) {
    addEvent(events, project, `evidence-${dimension}`, "evidence-observation", {
      evidence: evidence(project, dimension, `${fixture.projectReference}-${dimension}`, [], sourceQualityClassification),
    });
  }
  for (const dimension of fixture.conflictingDimensions) {
    const firstId = `${fixture.projectReference}-${dimension}-a`;
    const secondId = `${fixture.projectReference}-${dimension}-b`;
    addEvent(events, project, `evidence-${dimension}-a`, "evidence-observation", {
      evidence: evidence(project, dimension, firstId, [secondId], sourceQualityClassification),
    });
    addEvent(events, project, `evidence-${dimension}-b`, "evidence-observation", {
      evidence: evidence(project, dimension, secondId, [], sourceQualityClassification),
    });
  }
  for (const dimension of fixture.completeNotFoundDimensions) {
    addEvent(events, project, `search-complete-${dimension}`, "search-assessment", {
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
    addEvent(events, project, `search-partial-${dimension}`, "search-assessment", {
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
    addEvent(events, project, `state-not-applicable-${dimension}`, "project-state-change", { state });
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
    addEvent(events, project, "state-facility-lifecycle", "project-state-change", { state });
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
    addEvent(events, project, "state-power-delivery", "project-state-change", { state });
  }
  return {
    project,
    profile,
    projection: deriveProofLedgerProjection(events, AS_OF),
  };
}

test("versioned profiles and rules cover the full canonical taxonomy", () => {
  assert.equal(fixtureData.fixtureStatus, "illustrative");
  assert.equal(fixtureData.policyVersion, SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION);
  assert.deepEqual(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension), SAFELOC_PROOF_DIMENSIONS);
  assert.equal(new Set(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension)).size, SAFELOC_PROOF_DIMENSIONS.length);
  for (const rule of SAFELOC_EXPECTED_EVIDENCE_RULES) {
    assert.ok(rule.expectedClaims.length > 0, `${rule.dimension} has expected claim guidance`);
    assert.ok(rule.preferredSourceKinds.length > 0, `${rule.dimension} has preferred source guidance`);
    assert.ok(rule.freshnessLimitDays > 0, `${rule.dimension} has freshness policy`);
  }
  for (const fixture of fixtureData.cases) {
    validateExpectedEvidenceProfile({
      ...fixture.profile,
      project: createProjectIdentity({
        projectReference: fixture.projectReference,
        name: fixture.projectName,
        scope: fixture.scope,
      }),
    });
    for (const signal of [
      fixture.profile.stage,
      fixture.profile.scale,
      fixture.profile.projectType,
      fixture.profile.jurisdiction,
      fixture.profile.coolingDesign,
    ]) {
      assert.ok(signal.provenance.rationale.length > 0, `${fixture.name} profile values retain explicit provenance`);
    }
  }
});

test("browser-facing offline proof fixtures match the evaluator matrix and contain no model activations", () => {
  assert.equal(EXPECTED_EVIDENCE_FIXTURE_DATA.fixtureStatus, "illustrative");
  assert.equal(EXPECTED_EVIDENCE_FIXTURE_DATA.policyVersion, SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION);
  assert.equal(EXPECTED_EVIDENCE_FIXTURE_DATA.cases.length, fixtureData.cases.length);

  for (const [index, fixture] of fixtureData.cases.entries()) {
    const reusable = createExpectedEvidenceFixtureProjection(EXPECTED_EVIDENCE_FIXTURE_DATA.cases[index]!);
    const existingTestProjection = createFixtureProjection(fixture);
    assert.deepEqual(
      evaluateExpectedEvidence(reusable.profile, reusable.projection),
      evaluateExpectedEvidence(existingTestProjection.profile, existingTestProjection.projection),
      `${fixture.name} fixture should match the established evaluator matrix`,
    );
    assert.ok(reusable.projection.events.every((event) => event.decisionRef === null));
    assert.deepEqual(reusable.projection.acceptedInputsById, {});
  }
});

test("JSON profile inputs validate versions, enums, numeric scale, dated provenance, and scope", () => {
  const fixture = fixtureData.cases[0]!;
  const { profile } = createFixtureProjection(fixture);

  const badVersion = { ...profile, profileVersion: 99 } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(badVersion), /Unsupported Expected Evidence profile version/);

  const badStage = {
    ...profile,
    stage: { ...profile.stage, value: "shovel-ready" },
  } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(badStage), /Stage profile value is outside/);

  const badLoad = {
    ...profile,
    scale: {
      ...profile.scale,
      value: { category: "hyperscale", itLoadMW: "500" },
    },
  } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(badLoad), /Scale profile value is outside/);

  const badScale = {
    ...profile,
    scale: {
      ...profile.scale,
      value: { category: "planetary", itLoadMW: Number.POSITIVE_INFINITY },
    },
  } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(badScale), /Scale profile value is outside/);

  const badProvenanceDate = {
    ...profile,
    scale: {
      ...profile.scale,
      provenance: { ...profile.scale.provenance, asOfDate: "not-a-date" },
    },
  } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(badProvenanceDate), /valid as-of date/);

  const wrongProvenanceScope = {
    ...profile,
    scale: {
      ...profile.scale,
      provenance: { ...profile.scale.provenance, scope: { kind: "campus", key: "other-campus" } },
    },
  } as unknown as ExpectedEvidenceProfile;
  assert.throws(() => validateExpectedEvidenceProfile(wrongProvenanceScope), /canonical scope-qualified identity/);
});

test("deterministic scenario fixtures evaluate all dimensions with project-scope and provenance intact", () => {
  for (const fixture of fixtureData.cases) {
    const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");
    const result = evaluateExpectedEvidence(profile, projection);
    assert.equal(result.policyVersion, SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION, fixture.name);
    assert.equal(result.project.projectId, project.projectId, fixture.name);
    assert.equal(result.dimensions.length, SAFELOC_PROOF_DIMENSIONS.length, fixture.name);
    assert.deepEqual(result.dimensions.map((item) => item.dimension), SAFELOC_PROOF_DIMENSIONS, fixture.name);
    assert.ok(result.dimensions.every((item) => item.evidence.every((record) => record.project.projectId === project.projectId)));

    for (const dimension of fixture.supportedDimensions) {
      assert.equal(result.dimensions.find((item) => item.dimension === dimension)?.evidenceResolution, "supported", `${fixture.name}: ${dimension}`);
    }
    for (const dimension of fixture.conflictingDimensions) {
      assert.equal(result.dimensions.find((item) => item.dimension === dimension)?.evidenceResolution, "conflicting", `${fixture.name}: ${dimension}`);
    }
    for (const dimension of fixture.completeNotFoundDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.searchState, "complete");
      assert.equal(
        item.evidenceResolution,
        item.expectation === "not-expected" ? "not-expected" : "searched-not-found",
      );
    }
    for (const dimension of fixture.incompleteSearchDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.searchState, "partial");
      assert.equal(item.evidenceResolution, "not-assessed");
    }
    for (const dimension of fixture.notApplicableDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.ledgerApplicability, "not-applicable");
      assert.equal(item.evidenceResolution, "not-expected");
    }
    if (fixture.name.startsWith("Sparse evidence")) {
      const unsearched = result.dimensions.find((item) => item.dimension === "tenant-counterparty")!;
      assert.equal(unsearched.ledgerApplicability, "unknown");
      assert.equal(unsearched.searchState, "not-run");
      assert.equal(unsearched.evidenceResolution, "not-assessed");
      assert.equal(unsearched.expectation, "unknown");
      assert.equal(result.dimensions.find((item) => item.dimension === "construction-phasing")?.expectation, "unknown");
      assert.equal(result.dimensions.find((item) => item.dimension === "water-cooling")?.expectation, "unknown");
      const identity = result.dimensions.find((item) => item.dimension === "project-identity")!;
      assert.equal(identity.expectation, "expected");
      assert.equal(identity.jurisdictionSourceGuidance.jurisdictionStatus, "unknown");
      assert.equal(identity.jurisdictionSourceGuidance.geographyImpliesAbsence, false);
    }
  }
});

test("profile signals change decisions, claim requirements, jurisdiction guidance, and public/confidential posture", () => {
  const redOak = fixtureData.cases.find((item) => item.name === "Red Oak")!;
  const redOakData = createFixtureProjection(redOak);
  const redOakResult = evaluateExpectedEvidence(redOakData.profile, redOakData.projection);
  const power = redOakResult.dimensions.find((item) => item.dimension === "power-grid-interconnection")!;
  assert.equal(power.expectation, "expected");
  assert.ok(power.expectedClaims.some((claim) => /construction progress/i.test(claim)));
  const construction = redOakResult.dimensions.find((item) => item.dimension === "construction-phasing")!;
  assert.equal(construction.expectation, "expected");
  assert.ok(construction.expectedClaims.some((claim) => /critical path/i.test(claim)));
  assert.equal(construction.evidence[0]?.sourceQualityClassification, "Model Inference");
  assert.equal(construction.evidence[0]?.valueStatus, "estimate");
  assert.deepEqual(construction.evidence[0]?.sourceIds, ["source-red-oak-construction-phasing"]);
  assert.equal(construction.evidence[0]?.asOfDate, "2026-02-28");
  assert.equal(power.jurisdictionSourceGuidance.jurisdictionStatus, "known");
  assert.ok(power.jurisdictionSourceGuidance.targets.some((target) => target.jurisdiction === "US-TX"));
  assert.equal(power.jurisdictionSourceGuidance.geographyImpliesAbsence, false);
  assert.match(power.jurisdictionSourceGuidance.caveat, /never implies.*absent/);

  const small = fixtureData.cases.find((item) => item.name.startsWith("Small colocation"))!;
  const smallData = createFixtureProjection(small);
  const smallResult = evaluateExpectedEvidence(smallData.profile, smallData.projection);
  const constructionAtOperationalSite = smallResult.dimensions.find((item) => item.dimension === "construction-phasing")!;
  assert.equal(constructionAtOperationalSite.expectation, "expected");
  assert.ok(constructionAtOperationalSite.expectedClaims.some((claim) => /active or planned expansion/i.test(claim)));
  const coolingWithoutProcessWater = smallResult.dimensions.find((item) => item.dimension === "water-cooling")!;
  assert.equal(coolingWithoutProcessWater.expectation, "expected");
  assert.ok(coolingWithoutProcessWater.expectedClaims.some((claim) => /heat-rejection/i.test(claim)));
  const financing = smallResult.dimensions.find((item) => item.dimension === "financing-capital")!;
  assert.equal(financing.likelyPublicConfidential, "likely-confidential");
  assert.ok(financing.expectedClaims.some((claim) => /small scale/i.test(claim)));
  assert.equal(smallResult.dimensions.find((item) => item.dimension === "tenant-counterparty")?.expectation, "expected");

  const enterpriseProfile: ExpectedEvidenceProfile = {
    ...smallData.profile,
    projectType: {
      status: "known",
      value: "enterprise-owner-operated",
      provenance: {
        kind: "illustrative",
        sourceIds: [],
        rationale: "Explicit illustrative profile variation for unit coverage.",
        asOfDate: "2026-03-01",
        scope: smallData.profile.project.scope,
      },
    },
  };
  const enterpriseResult = evaluateExpectedEvidence(enterpriseProfile, smallData.projection);
  const tenant = enterpriseResult.dimensions.find((item) => item.dimension === "tenant-counterparty")!;
  assert.equal(tenant.expectation, "not-expected");
  assert.match(tenant.decisionReason, /owner-operated/);

  const nonTexas = fixtureData.cases.find((item) => item.name.startsWith("Non-Texas"))!;
  const nonTexasData = createFixtureProjection(nonTexas);
  const nonTexasResult = evaluateExpectedEvidence(nonTexasData.profile, nonTexasData.projection);
  assert.equal(
    nonTexasResult.dimensions.find((item) => item.dimension === "permitting-entitlement")?.expectation,
    "expected",
  );
  assert.ok(
    nonTexasResult.dimensions
      .find((item) => item.dimension === "permitting-entitlement")!
      .jurisdictionSourceGuidance.targets.some((target) => target.jurisdiction === "US-VA"),
  );
});

test("eligibility, explicit conflicts, incomplete search, and not-applicable remain distinct", () => {
  const fixture = fixtureData.cases.find((item) => item.name.startsWith("Small colocation"))!;
  const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");
  const ineligible = evidence(project, "financing-capital", "ineligible-financing");
  ineligible.eligibility = { eligible: false, reason: "Illustrative record is outside the facility scope." };
  const ineligibleEvent: StoredProofLedgerEvent = {
    eventId: "ineligible-financing-event",
    eventType: "evidence-observation",
    project,
    effectiveAt: ineligible.observedAt,
    recordedAt: "2026-03-03T00:00:00.000Z",
    researchRunId: null,
    versions: VERSIONS,
    decisionRef: null,
    payload: { evidence: ineligible },
  };
  validateProofLedgerEvent(ineligibleEvent);
  const amended = deriveProofLedgerProjection([...projection.events, ineligibleEvent], AS_OF);
  const result = evaluateExpectedEvidence(profile, amended);
  const finance = result.dimensions.find((item) => item.dimension === "financing-capital")!;
  assert.equal(finance.evidenceResolution, "not-assessed");
  assert.deepEqual(finance.unsupportedEvidence.map((item) => item.evidenceId), ["ineligible-financing"]);
  const incentives = result.dimensions.find((item) => item.dimension === "incentives-taxes")!;
  assert.equal(incentives.expectation, "not-expected");
  assert.equal(incentives.evidenceResolution, "not-expected");
  const incompleteFixture = fixtureData.cases.find((item) => item.name === "Stargate Abilene")!;
  const incompleteData = createFixtureProjection(incompleteFixture);
  const incompleteResult = evaluateExpectedEvidence(incompleteData.profile, incompleteData.projection);
  const incomplete = incompleteResult.dimensions.find((item) => item.dimension === "water-cooling")!;
  assert.equal(incomplete.searchState, "partial");
  assert.equal(incomplete.evidenceResolution, "not-assessed");
  assert.equal(incomplete.expectation, "unknown");

  const blockedAndFailed: StoredProofLedgerEvent[] = [];
  for (const [dimension, state] of [
    ["water-cooling", "blocked"],
    ["environmental-air-generation", "failed"],
  ] as const) {
    const searchEvent: StoredProofLedgerEvent = {
      eventId: `search-${state}-${dimension}`,
      eventType: "search-assessment",
      project: incompleteData.project,
      effectiveAt: "2026-03-03T00:00:00.000Z",
      recordedAt: "2026-03-03T00:00:00.000Z",
      researchRunId: null,
      versions: VERSIONS,
      decisionRef: null,
      payload: {
        search: {
          searchId: `search-${state}-${dimension}`,
          project: incompleteData.project,
          dimension,
          state,
          resolution: "not-assessed",
          reason: `Illustrative ${state} search; no negative conclusion.`,
          queryIds: [],
          researchRunId: null,
          observedAt: "2026-03-03T00:00:00.000Z",
        },
      },
    };
    validateProofLedgerEvent(searchEvent);
    blockedAndFailed.push(searchEvent);
  }
  const blockedFailedProjection = deriveProofLedgerProjection(
    [...incompleteData.projection.events, ...blockedAndFailed],
    AS_OF,
  );
  const blockedFailedResult = evaluateExpectedEvidence(incompleteData.profile, blockedFailedProjection);
  for (const [dimension, state] of [
    ["water-cooling", "blocked"],
    ["environmental-air-generation", "failed"],
  ] as const) {
    const row = blockedFailedResult.dimensions.find((item) => item.dimension === dimension)!;
    assert.equal(row.searchState, state);
    assert.equal(row.evidenceResolution, "not-assessed");
  }
});

test("stale and superseded evidence are exposed and cannot advance maturity", () => {
  const fixture = fixtureData.cases[0]!;
  const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");
  const staleRecord = evidence(project, "incentives-taxes", "stale-incentives", [], "Verified Evidence");
  staleRecord.asOfDate = "2020-01-01";
  const staleEvent: StoredProofLedgerEvent = {
    eventId: "stale-financing-event",
    eventType: "evidence-observation",
    project,
    effectiveAt: staleRecord.observedAt,
    recordedAt: "2026-03-03T00:00:00.000Z",
    researchRunId: null,
    versions: VERSIONS,
    decisionRef: null,
    payload: { evidence: staleRecord },
  };
  validateProofLedgerEvent(staleEvent);
  const staleConstruction = evidence(project, "construction-phasing", "stale-construction", [], "Verified Evidence");
  staleConstruction.asOfDate = "2020-01-01";
  const staleConstructionEvent: StoredProofLedgerEvent = {
    ...staleEvent,
    eventId: "stale-construction-event",
    payload: { evidence: staleConstruction },
  };
  validateProofLedgerEvent(staleConstructionEvent);
  const staleFacilityState: ProjectStateRecord = {
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "construction" },
    supportingEvidenceIds: [staleConstruction.evidenceId],
    stateVersion: "stale-state-v1",
    asOfDate: "2020-01-01",
  };
  const staleFacilityStateEvent: StoredProofLedgerEvent = {
    ...staleEvent,
    eventId: "zz-stale-facility-state",
    eventType: "project-state-change",
    effectiveAt: "2026-03-04T00:00:00.000Z",
    recordedAt: "2026-03-04T00:00:00.000Z",
    payload: { state: staleFacilityState },
  };
  validateProofLedgerEvent(staleFacilityStateEvent);

  const powerEvidenceId = "red-oak-power-grid-interconnection";
  const supersession: StoredProofLedgerEvent = {
    eventId: "power-evidence-supersession",
    eventType: "supersession",
    project,
    effectiveAt: "2026-03-03T00:00:00.000Z",
    recordedAt: "2026-03-03T00:00:00.000Z",
    researchRunId: null,
    versions: VERSIONS,
    decisionRef: null,
    payload: {
      supersededEvidenceId: powerEvidenceId,
      supersedingEvidenceId: "replacement-power-evidence",
      reason: "Illustrative fixture link used to test supersession handling.",
    },
  };
  const events = [...projection.events, staleEvent, staleConstructionEvent, staleFacilityStateEvent, supersession];
  const amended = deriveProofLedgerProjection(events, AS_OF);
  const result = evaluateExpectedEvidence(profile, amended);
  const incentives = result.dimensions.find((item) => item.dimension === "incentives-taxes")!;
  assert.equal(incentives.staleEvidence.length, 1);
  assert.equal(incentives.staleEvidence[0]?.status, "stale");
  assert.equal(incentives.evidenceResolution, "not-assessed");
  const power = result.dimensions.find((item) => item.dimension === "power-grid-interconnection")!;
  assert.deepEqual(power.supersededEvidence.map((item) => item.observation.evidenceId), [powerEvidenceId]);
  assert.equal(power.evidenceResolution, "not-assessed");
  assert.equal(result.maturity.powerDelivery.status, "unknown");
  assert.match(result.maturity.powerDelivery.reason, /superseded/);
  assert.equal(result.maturity.facilityLifecycle.status, "unknown");
  assert.match(result.maturity.facilityLifecycle.reason, /stale/);
});

test("future as-of and effective evidence is exposed but cannot support findings or maturity", () => {
  const fixture = fixtureData.cases[0]!;
  const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");
  const futureAsOf = evidence(project, "community-local-government", "future-community-record", [], "Verified Evidence");
  futureAsOf.asOfDate = "2030-06-01";
  futureAsOf.publicationDate = "2030-06-02";
  const futureAsOfEvent = storedEvidenceEvent(
    futureAsOf,
    "future-community-event",
    "2026-03-03T00:00:00.000Z",
  );

  const futureEffective = evidence(project, "construction-phasing", "future-effective-construction", [], "Verified Evidence");
  const futureEffectiveEvent = storedEvidenceEvent(
    futureEffective,
    "future-effective-construction-event",
    "2026-03-03T00:00:00.000Z",
    "2027-01-01T00:00:00.000Z",
  );
  const facilityState: ProjectStateRecord = {
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "construction" },
    supportingEvidenceIds: [futureEffective.evidenceId],
    stateVersion: "future-evidence-state-v1",
    asOfDate: "2026-03-03",
  };
  const facilityStateEvent = storedStateEvent(
    facilityState,
    "future-effective-facility-state",
    "2026-03-04T00:00:00.000Z",
  );
  const projectionWithFutureRecords = deriveProofLedgerProjection(
    [...projection.events, futureAsOfEvent, futureEffectiveEvent, facilityStateEvent],
    AS_OF,
  );
  const result = evaluateExpectedEvidence(profile, projectionWithFutureRecords);

  const community = result.dimensions.find((item) => item.dimension === "community-local-government")!;
  assert.equal(community.futureEvidence.length, 1);
  assert.equal(community.futureEvidence[0]?.status, "future");
  assert.ok(community.futureEvidence[0]?.futureDates.includes("2030-06-01"));
  assert.equal(community.evidenceResolution, "not-assessed");
  assert.equal(result.maturity.facilityLifecycle.status, "unknown");
  assert.match(result.maturity.facilityLifecycle.reason, /future as-of.*effective date/);
});

test("only fresh, dimension-matched, direct source-quality evidence can advance the two maturity tracks", () => {
  const fixture = fixtureData.cases[0]!;
  const { profile, projection } = createFixtureProjection(fixture, "Verified Evidence");
  const supported = evaluateExpectedEvidence(profile, projection);
  assert.equal(supported.maturity.facilityLifecycle.status, "known");
  assert.equal(supported.maturity.facilityLifecycle.stage, "construction");
  assert.equal(supported.maturity.powerDelivery.status, "known");
  assert.equal(supported.maturity.powerDelivery.stage, "queue");
  assert.deepEqual(Object.keys(supported.maturity).sort(), ["facilityLifecycle", "powerDelivery"]);

  const project = profile.project;
  const currentPowerEvidenceId = "red-oak-power-grid-interconnection";
  const conflicting = evidence(
    project,
    "power-grid-interconnection",
    "conflicting-power-evidence",
    [currentPowerEvidenceId],
    "Verified Evidence",
  );
  const conflictEvent: StoredProofLedgerEvent = {
    eventId: "conflicting-power-evidence-event",
    eventType: "evidence-observation",
    project,
    effectiveAt: conflicting.observedAt,
    recordedAt: "2026-03-03T00:00:00.000Z",
    researchRunId: null,
    versions: VERSIONS,
    decisionRef: null,
    payload: { evidence: conflicting },
  };
  validateProofLedgerEvent(conflictEvent);
  const conflictedProjection = deriveProofLedgerProjection(
    [...projection.events, conflictEvent],
    AS_OF,
  );
  const conflicted = evaluateExpectedEvidence(profile, conflictedProjection);
  assert.equal(conflicted.maturity.powerDelivery.status, "unknown");
  assert.match(conflicted.maturity.powerDelivery.reason, /conflicting/);
});

test("maturity rejects announced/not-started construction and applications as proof of later stages", () => {
  const fixture = fixtureData.cases[0]!;
  const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");

  const announcedOnly = evidence(project, "construction-phasing", "announced-only-construction", [], "Verified Evidence");
  announcedOnly.claim = "The company announcement describes a future construction plan.";
  announcedOnly.value = "Construction has not started.";
  announcedOnly.developmentQualifier = "Announced project; not under construction.";
  announcedOnly.retainedPassage = "The company announced plans to start construction in 2027; site work has not started.";
  const announcedOnlyEvent = storedEvidenceEvent(
    announcedOnly,
    "announced-only-construction-event",
    "2026-03-03T00:00:00.000Z",
  );
  const incorrectOperationalState = storedStateEvent({
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "operational" },
    supportingEvidenceIds: [announcedOnly.evidenceId],
    stateVersion: "incorrect-operational-v1",
    asOfDate: "2026-03-03",
  }, "incorrect-operational-state", "2026-03-04T00:00:00.000Z");

  const applicationOnly = evidence(project, "power-grid-interconnection", "application-only-power", [], "Verified Evidence");
  applicationOnly.claim = "The utility filed the project's interconnection application.";
  applicationOnly.value = "The application was accepted for study.";
  applicationOnly.developmentQualifier = "Application accepted; no energization reported.";
  applicationOnly.retainedPassage = "The utility docket records the interconnection application as accepted for study; energization is expected after required upgrades.";
  const applicationOnlyEvent = storedEvidenceEvent(
    applicationOnly,
    "application-only-power-event",
    "2026-03-03T00:00:00.000Z",
  );
  const incorrectEnergizedState = storedStateEvent({
    project,
    stateKey: "power-delivery",
    state: { status: "known", value: "energized" },
    supportingEvidenceIds: [applicationOnly.evidenceId],
    stateVersion: "incorrect-energized-v1",
    asOfDate: "2026-03-03",
  }, "incorrect-energized-state", "2026-03-04T00:00:00.000Z");

  const inconsistentProjection = deriveProofLedgerProjection(
    [
      ...projection.events,
      announcedOnlyEvent,
      applicationOnlyEvent,
      incorrectOperationalState,
      incorrectEnergizedState,
    ],
    AS_OF,
  );
  const result = evaluateExpectedEvidence(profile, inconsistentProjection);
  assert.equal(result.maturity.facilityLifecycle.status, "unknown");
  assert.match(result.maturity.facilityLifecycle.reason, /does not affirm.*operational/);
  assert.equal(result.maturity.powerDelivery.status, "unknown");
  assert.match(result.maturity.powerDelivery.reason, /does not affirm.*energized/);
});

test("maturity supports explicit N/A, rejects unknown stage values, and permits recorded regression", () => {
  const fixture = fixtureData.cases[0]!;
  const { project, profile, projection } = createFixtureProjection(fixture, "Verified Evidence");

  const unrecognizedState = storedStateEvent({
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "shovel-ready" },
    supportingEvidenceIds: ["red-oak-construction-phasing"],
    stateVersion: "unrecognized-stage-v1",
    asOfDate: "2026-03-03",
  }, "unrecognized-facility-stage", "2026-03-03T00:00:00.000Z");
  const notApplicablePower = storedStateEvent({
    project,
    stateKey: "power-delivery",
    state: { status: "not-applicable", value: null, reason: "Explicit fixture state for an asset without a power-delivery maturity track." },
    supportingEvidenceIds: [],
    stateVersion: "power-not-applicable-v1",
    asOfDate: "2026-03-03",
  }, "power-not-applicable-state", "2026-03-03T00:00:00.000Z");
  const exceptionalProjection = deriveProofLedgerProjection(
    [...projection.events, unrecognizedState, notApplicablePower],
    AS_OF,
  );
  const exceptionalResult = evaluateExpectedEvidence(profile, exceptionalProjection);
  assert.equal(exceptionalResult.maturity.facilityLifecycle.status, "unknown");
  assert.match(exceptionalResult.maturity.facilityLifecycle.reason, /not a recognized/);
  assert.equal(exceptionalResult.maturity.powerDelivery.status, "not-applicable");

  const operationalEvidence = evidence(project, "construction-phasing", "regression-operational-evidence", [], "Management Assertion");
  operationalEvidence.claim = "Phase 1 of the data center is in commercial operation.";
  operationalEvidence.value = "The facility began commercial operations in March 2026.";
  operationalEvidence.developmentQualifier = "Current operating status";
  operationalEvidence.retainedPassage = "The company said Phase 1 began commercial operations in March 2026 and is now serving customers.";
  const operationalEvidenceEvent = storedEvidenceEvent(
    operationalEvidence,
    "regression-operational-evidence-event",
    "2026-03-03T00:00:00.000Z",
  );
  const operationalStateEvent = storedStateEvent({
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "operational" },
    supportingEvidenceIds: [operationalEvidence.evidenceId],
    stateVersion: "operational-state-v1",
    asOfDate: "2026-03-03",
  }, "regression-operational-state", "2026-03-03T00:00:01.000Z");
  const regressedConstructionState = storedStateEvent({
    project,
    stateKey: "facility-lifecycle",
    state: { status: "known", value: "construction" },
    supportingEvidenceIds: ["red-oak-construction-phasing"],
    stateVersion: "regressed-construction-state-v1",
    asOfDate: "2026-03-04",
  }, "regression-construction-state", "2026-03-04T00:00:00.000Z");
  const regressionProjection = deriveProofLedgerProjection(
    [...projection.events, operationalEvidenceEvent, operationalStateEvent, regressedConstructionState],
    AS_OF,
  );
  const regressionResult = evaluateExpectedEvidence(profile, regressionProjection);
  assert.equal(regressionResult.maturity.facilityLifecycle.status, "known");
  assert.equal(regressionResult.maturity.facilityLifecycle.stage, "construction");
  assert.equal(regressionResult.maturity.facilityLifecycle.state?.stateVersion, "regressed-construction-state-v1");
});

test("evaluator rejects evidence from another scope", () => {
  const fixture = fixtureData.cases[0]!;
  const { profile, projection } = createFixtureProjection(fixture);
  const otherProject = createProjectIdentity({
    projectReference: fixture.projectReference,
    name: fixture.projectName,
    scope: { kind: "campus", key: "main-campus" },
  });
  assert.throws(
    () => evaluateExpectedEvidence({ ...profile, project: otherProject }, projection),
    /identity.*scope|scope.*identity/,
  );
});
