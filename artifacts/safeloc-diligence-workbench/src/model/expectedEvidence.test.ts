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
  SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
  SAFELOC_EXPECTED_EVIDENCE_RULES,
  evaluateExpectedEvidence,
  expectedEvidenceApplicabilityStateKey,
} from "./expectedEvidence.js";

type FixtureCase = {
  name: string;
  projectReference: string;
  projectName: string;
  scope: ProjectScope;
  supportedDimensions: SafeLocProofDimension[];
  conflictingDimensions: SafeLocProofDimension[];
  completeNotFoundDimensions: SafeLocProofDimension[];
  incompleteSearchDimensions: SafeLocProofDimension[];
  notApplicableDimensions: SafeLocProofDimension[];
  facilityLifecycle: string | null;
  powerDelivery: string | null;
};

const fixtureData = JSON.parse(
  await readFile(new URL("../../../server/fixtures/expected-evidence-cases.json", import.meta.url), "utf8"),
) as { fixtureStatus: string; policyVersion: number; cases: FixtureCase[] };
const VERSIONS = { schemaVersion: 1, policyVersion: 1, modelVersion: null };
const AS_OF = "2026-04-01T00:00:00.000Z";

function evidence(
  project: ReturnType<typeof createProjectIdentity>,
  dimension: SafeLocProofDimension,
  evidenceId: string,
  conflictsWithEvidenceIds: string[] = [],
): EvidenceObservation {
  return {
    evidenceId,
    project,
    dimension,
    claim: `Illustrative retained ${dimension} evidence`,
    value: "fixture value",
    unit: null,
    valueStatus: "estimate",
    developmentQualifier: "Illustrative test fixture",
    publicationDate: "2026-03-01",
    asOfDate: "2026-02-28",
    retainedPassageId: `passage-${evidenceId}`,
    retainedPassage: `Illustrative passage retained for ${dimension}.`,
    sourceIds: [`source-${evidenceId}`],
    sourceQualityClassification: "Model Inference",
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

function createFixtureProjection(fixture: FixtureCase) {
  const project = createProjectIdentity({
    projectReference: fixture.projectReference,
    name: fixture.projectName,
    scope: fixture.scope,
  });
  const events: StoredProofLedgerEvent[] = [];
  for (const dimension of fixture.supportedDimensions) {
    addEvent(events, project, `evidence-${dimension}`, "evidence-observation", {
      evidence: evidence(project, dimension, `${fixture.projectReference}-${dimension}`),
    });
  }
  for (const dimension of fixture.conflictingDimensions) {
    const firstId = `${fixture.projectReference}-${dimension}-a`;
    const secondId = `${fixture.projectReference}-${dimension}-b`;
    addEvent(events, project, `evidence-${dimension}-a`, "evidence-observation", {
      evidence: evidence(project, dimension, firstId, [secondId]),
    });
    addEvent(events, project, `evidence-${dimension}-b`, "evidence-observation", {
      evidence: evidence(project, dimension, secondId),
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
    projection: deriveProofLedgerProjection(events, AS_OF),
  };
}

test("versioned expected-evidence rules cover the full canonical taxonomy", () => {
  assert.equal(fixtureData.fixtureStatus, "illustrative");
  assert.equal(fixtureData.policyVersion, SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION);
  assert.deepEqual(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension), SAFELOC_PROOF_DIMENSIONS);
  assert.equal(new Set(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension)).size, SAFELOC_PROOF_DIMENSIONS.length);
  for (const rule of SAFELOC_EXPECTED_EVIDENCE_RULES) {
    assert.ok(rule.expectedClaims.length > 0, `${rule.dimension} has expected claim guidance`);
    assert.ok(rule.preferredSourceKinds.length > 0, `${rule.dimension} has preferred source guidance`);
  }
});

test("deterministic scenario fixtures evaluate all dimensions with project-scope and provenance intact", () => {
  for (const fixture of fixtureData.cases) {
    const { project, projection } = createFixtureProjection(fixture);
    const result = evaluateExpectedEvidence(project, projection);
    assert.equal(result.policyVersion, SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION, fixture.name);
    assert.equal(result.project.projectId, project.projectId, fixture.name);
    assert.equal(result.dimensions.length, SAFELOC_PROOF_DIMENSIONS.length, fixture.name);
    assert.deepEqual(result.dimensions.map((item) => item.dimension), SAFELOC_PROOF_DIMENSIONS, fixture.name);
    assert.ok(result.dimensions.every((item) => item.evidence.every((record) => record.project.projectId === project.projectId)));

    for (const dimension of fixture.supportedDimensions) {
      assert.equal(result.dimensions.find((item) => item.dimension === dimension)?.resolution, "supported", `${fixture.name}: ${dimension}`);
    }
    for (const dimension of fixture.conflictingDimensions) {
      assert.equal(result.dimensions.find((item) => item.dimension === dimension)?.resolution, "conflicting", `${fixture.name}: ${dimension}`);
    }
    for (const dimension of fixture.completeNotFoundDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.searchState, "complete");
      assert.equal(item.resolution, "searched-not-found");
    }
    for (const dimension of fixture.incompleteSearchDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.searchState, "partial");
      assert.equal(item.resolution, "not-assessed");
    }
    for (const dimension of fixture.notApplicableDimensions) {
      const item = result.dimensions.find((candidate) => candidate.dimension === dimension)!;
      assert.equal(item.applicability, "not-applicable");
      assert.equal(item.resolution, "not-applicable");
    }
    if (fixture.name.startsWith("Sparse evidence")) {
      const unsearched = result.dimensions.find((item) => item.dimension === "tenant-counterparty")!;
      assert.equal(unsearched.applicability, "unknown");
      assert.equal(unsearched.searchState, "not-run");
      assert.equal(unsearched.resolution, "not-assessed");
    }
  }
});

test("eligibility, explicit conflicts, and not-applicable do not collapse into missing evidence", () => {
  const fixture = fixtureData.cases.find((item) => item.name.startsWith("Small colocation"))!;
  const { project, projection } = createFixtureProjection(fixture);
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
  const events = [
    ...projection.events,
    ineligibleEvent,
  ] as StoredProofLedgerEvent[];
  const amended = deriveProofLedgerProjection(events, AS_OF);
  const result = evaluateExpectedEvidence(project, amended);
  const finance = result.dimensions.find((item) => item.dimension === "financing-capital")!;
  assert.equal(finance.resolution, "searched-not-found");
  assert.deepEqual(finance.ineligibleEvidenceIds, ["ineligible-financing"]);
  assert.equal(result.dimensions.find((item) => item.dimension === "incentives-taxes")?.resolution, "not-applicable");
});

test("maturity is explicit and limited to facility lifecycle and power delivery", () => {
  const fixture = fixtureData.cases.find((item) => item.name === "Red Oak")!;
  const { project, projection } = createFixtureProjection(fixture);
  const result = evaluateExpectedEvidence(project, projection);
  assert.equal(result.maturity.facilityLifecycle.status, "known");
  assert.equal(result.maturity.facilityLifecycle.stage, "construction");
  assert.deepEqual(result.maturity.facilityLifecycle.supportingEvidenceIds, ["red-oak-construction-phasing"]);
  assert.equal(result.maturity.powerDelivery.status, "known");
  assert.equal(result.maturity.powerDelivery.stage, "queue");
  assert.equal(result.dimensions.find((item) => item.dimension === "construction-phasing")?.evidence[0]?.sourceQualityClassification, "Model Inference");
  assert.equal(result.dimensions.find((item) => item.dimension === "construction-phasing")?.evidence[0]?.valueStatus, "estimate");
  assert.equal(result.dimensions.find((item) => item.dimension === "construction-phasing")?.evidence[0]?.publicationDate, "2026-03-01");

  const sparse = fixtureData.cases.find((item) => item.name.startsWith("Sparse evidence"))!;
  const sparseFixture = createFixtureProjection(sparse);
  const sparseResult = evaluateExpectedEvidence(sparseFixture.project, sparseFixture.projection);
  assert.equal(sparseResult.maturity.facilityLifecycle.status, "unknown");
  assert.equal(sparseResult.maturity.powerDelivery.status, "unknown");
});

test("evaluator rejects evidence from another scope", () => {
  const fixture = fixtureData.cases[0]!;
  const { project, projection } = createFixtureProjection(fixture);
  const otherProject = createProjectIdentity({
    projectReference: fixture.projectReference,
    name: fixture.projectName,
    scope: { kind: "campus", key: "main-campus" },
  });
  assert.throws(() => evaluateExpectedEvidence(otherProject, projection), /identity or scope does not match/);
});