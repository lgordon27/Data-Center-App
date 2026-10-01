import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createProjectIdentity,
  type ProofLedgerEvent,
  type ProjectIdentity,
  type ProofUserDecision,
  type TransmissionProposal,
} from "../src/model/safelocProofContract.js";
import {
  expectedAffectedVariable,
  financialTransmissionFormulaDescription,
  FINANCIAL_TRANSMISSION_POLICY_VERSION,
} from "../src/model/financialTransmission.js";
import {
  adaptSavedOfflineRun,
  adaptSavedOfflineDossier,
  createMatrixBaselineRun,
  validateOfflineSavedRun,
  type OfflineSavedRun,
  type OfflineValidationCase,
} from "./offlineDossierValidation.js";

const matrix = JSON.parse(await readFile(
  fileURLToPath(new URL("./fixtures/offline-validation-matrix.json", import.meta.url)),
  "utf8",
)) as { cases: OfflineValidationCase[] };
let eventCounter = 0;

function getCase(id = "databank-red-oak-dfw10") {
  const testCase = matrix.cases.find((candidate) => candidate.caseId === id);
  assert.ok(testCase, `Missing fixture case ${id}`);
  return testCase;
}

function baseline(id?: string) {
  const testCase = getCase(id);
  const run = adaptSavedOfflineRun(createMatrixBaselineRun(testCase));
  return { testCase, run, report: validateOfflineSavedRun(run, testCase) };
}

function proofEvent(
  project: ProjectIdentity,
  eventType: string,
  payload: Record<string, unknown>,
  decisionRef: string | null = null,
): ProofLedgerEvent {
  eventCounter += 1;
  return {
    eventId: `test-${eventType}-${eventCounter}`,
    eventType,
    project,
    effectiveAt: "2026-09-30T12:00:00.000Z",
    researchRunId: null,
    versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "test-only" },
    decisionRef,
    payload,
  } as ProofLedgerEvent;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

test("the five retained and illustrative matrix cases validate offline with honest unknowns", () => {
  assert.equal(matrix.cases.length, 5);
  for (const testCase of matrix.cases) {
    const run = adaptSavedOfflineRun(createMatrixBaselineRun(testCase));
    const report = validateOfflineSavedRun(run, testCase);
    assert.equal(
      report.findings.some((finding) => finding.status === "FAIL"),
      false,
      `${testCase.caseId}: ${report.findings.filter((finding) => finding.status === "FAIL").map((f) => f.detail).join("; ")}`,
    );
  }
  const sparse = baseline("sparse-unresolved-project");
  assert.ok(sparse.report.notAssertedFacts.length >= 3);
  assert.deepEqual(sparse.report.incompleteSearchDimensions, []);
});

test("fixture provenance keeps Red Oak source dates, phase/campus scope, and illustrative inputs separate", () => {
  const redOak = getCase();
  const campus = redOak.assertions.find((assertion) => assertion.id === "red-oak-campus-capacity");
  const phase = redOak.assertions.find((assertion) => assertion.id === "red-oak-phase-capacity");
  const dfw10 = redOak.assertions.find((assertion) => assertion.id === "red-oak-dfw10-scope-trap");
  assert.equal(campus?.expectedValue, 480);
  assert.equal(campus?.scope.key, "red-oak-campus");
  assert.equal(phase?.expectedValue, 180);
  assert.equal(phase?.scope.kind, "phase");
  assert.equal(dfw10?.expectedState, "not-asserted");
  assert.equal(redOak.sources[0]?.publishedAt, null);
  assert.equal(redOak.sources[0]?.accessedAt, null);
  assert.match(redOak.illustrativeRegressionInputs.status, /never ground truth/);
  assert.equal(redOak.illustrativeRegressionInputs.values.jurisdiction && (redOak.illustrativeRegressionInputs.values.jurisdiction as { locality?: string }).locality, "Abilene");
});

test("adapter clearly rejects malformed envelopes and values", () => {
  assert.throws(() => adaptSavedOfflineRun({ schemaVersion: 1 }), /adapter .* schemaVersion/);
  const raw = clone(createMatrixBaselineRun(getCase()));
  (raw.claims[0] as { value: unknown }).value = Number.NaN;
  assert.throws(() => adaptSavedOfflineRun(raw), /finite number/);
  const dossier = { ...createMatrixBaselineRun(getCase()), adapter: "safeloc-offline-saved-dossier-v1" };
  assert.equal(adaptSavedOfflineDossier(dossier).project.projectId, dossier.project.projectId);
});

test("validator catches wrong identity, values, units, statuses, dates, and scope", () => {
  const { testCase, run } = baseline();
  const wrongIdentity = clone(run);
  wrongIdentity.project = createProjectIdentity({
    projectReference: "unrelated-datacenter",
    name: "Unrelated facility",
    scope: testCase.project.scope,
  });
  assert.ok(validateOfflineSavedRun(wrongIdentity, testCase).findings.some((finding) =>
    finding.ruleId === "PROJECT_IDENTITY_MISMATCH" && finding.severity === "BLOCKER",
  ));

  const mutated = clone(run);
  const campusClaim = mutated.claims.find((claim) => claim.assertionRef === "red-oak-campus-capacity");
  assert.ok(campusClaim);
  campusClaim.value = 490;
  campusClaim.unit = "GW";
  campusClaim.valueStatus = "actual";
  campusClaim.asOfDate = "2026-04-21";
  campusClaim.scope = { kind: "facility", key: "dfw10" };
  const report = validateOfflineSavedRun(mutated, testCase);
  assert.ok(report.findings.some((finding) => finding.ruleId === "ASSERTION_CAPACITY" && finding.status === "FAIL"));
});

test("validator catches missing source/passages, unattributed assertions, unsupported numbers, and derived magnitudes", () => {
  const { testCase, run } = baseline();
  const missingPassage = clone(run);
  missingPassage.claims[0]!.retainedPassageIds = [];
  let report = validateOfflineSavedRun(missingPassage, testCase);
  assert.ok(report.findings.some((finding) => finding.ruleId === "CLAIM_SOURCE_OR_PASSAGE_UNSUPPORTED" && finding.status === "FAIL"));

  const unlinked = clone(run);
  const numericClaim = unlinked.claims.find((claim) => typeof claim.value === "number");
  assert.ok(numericClaim);
  numericClaim.sourceEvidenceIds = [];
  report = validateOfflineSavedRun(unlinked, testCase);
  assert.ok(report.unsupportedNumbers.length > 0);

  const unattributed = clone(run);
  unattributed.claims[0]!.attributed = false;
  report = validateOfflineSavedRun(unattributed, testCase);
  assert.ok(report.findings.some((finding) => finding.detail.includes("management assertions must remain attributed")));

  const derived = clone(run);
  derived.claims[0]!.derived = true;
  report = validateOfflineSavedRun(derived, testCase);
  assert.ok(report.findings.some((finding) => finding.ruleId === "UNSUPPORTED_DERIVED_MAGNITUDE" && finding.status === "FAIL"));
});

test("scope traps, explicit exclusions, forbidden claims, and conditional source retention are checked", () => {
  const { testCase, run } = baseline();
  const extendedCase: OfflineValidationCase = {
    ...testCase,
    assertions: [
      ...testCase.assertions,
      {
        id: "fixture-required-source",
        kind: "required-source",
        target: "campus-capacity",
        scope: testCase.project.scope,
        asOfDate: null,
        provenance: {
          sourceId: testCase.sources[0]!.sourceId,
          passageId: testCase.sources[0]!.passages[0]!.passageId,
          fixturePath: testCase.sources[0]!.fixturePath,
          attribution: "Required if this claim is present.",
        },
        severity: "MAJOR",
      },
      {
        id: "fixture-identity-exclusion",
        kind: "identity-exclusion",
        target: "identity",
        expectedValue: "Microsoft Ashburn",
        scope: testCase.project.scope,
        asOfDate: null,
        provenance: { sourceId: null, passageId: null, fixturePath: "test-only", attribution: "Test." },
        severity: "BLOCKER",
      },
      {
        id: "fixture-forbidden-claim",
        kind: "forbidden-claim",
        target: "unsupported-river-claim",
        expectedValue: "unlimited water",
        scope: testCase.project.scope,
        asOfDate: null,
        provenance: { sourceId: null, passageId: null, fixturePath: "test-only", attribution: "Test." },
        severity: "BLOCKER",
      },
    ],
  };
  const { report } = { report: validateOfflineSavedRun(run, extendedCase) };
  assert.ok(report.findings.some((finding) => finding.ruleId === "ASSERTION_REQUIRED_SOURCE" && finding.status === "PASS"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "ASSERTION_IDENTITY_EXCLUSION" && finding.status === "PASS"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "ASSERTION_FORBIDDEN_CLAIM" && finding.status === "PASS"));

  const badScope = clone(run);
  badScope.claims.push({
    claimId: "bad-scope-claim",
    target: "dfw10-capacity",
    kind: "capacity",
    text: "DFW10 is 180 MW",
    value: 180,
    unit: "MW",
    valueStatus: "forecast",
    scope: { kind: "facility", key: "dfw10" },
    asOfDate: "2026-04-21",
    sourceEvidenceIds: [badScope.claims[0]!.sourceEvidenceIds[0]!],
    retainedPassageIds: [badScope.claims[0]!.retainedPassageIds[0]!],
    attributed: true,
  });
  const badScopeReport = validateOfflineSavedRun(badScope, testCase);
  assert.ok(badScopeReport.findings.some((finding) => finding.ruleId === "ASSERTION_SCOPE_TRAP" && finding.status === "FAIL"));
});

test("incomplete searches are not misreported as searched-not-found and stay visible in the report", () => {
  const { testCase, run } = baseline();
  const blocked = proofEvent(run.project, "search-assessment", {
    search: {
      searchId: "blocked-power",
      project: run.project,
      dimension: "power-grid-interconnection",
      state: "blocked",
      resolution: "not-assessed",
      reason: "Provider unavailable before search telemetry.",
      queryIds: [],
      researchRunId: null,
      observedAt: "2026-09-30T12:00:00.000Z",
    },
  });
  run.proofEvents.push(blocked);
  run.claims.push({
    claimId: "dishonest-negative",
    target: "power-search",
    kind: "search-summary",
    text: "Power was searched and not found.",
    scope: run.project.scope,
    asOfDate: null,
    dimension: "power-grid-interconnection",
    sourceEvidenceIds: [],
    retainedPassageIds: [],
    searchResolution: "searched-not-found",
  });
  const report = validateOfflineSavedRun(run, testCase);
  assert.ok(report.incompleteSearchDimensions.includes("power-grid-interconnection"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "SEARCH_INCOMPLETE_AS_NOT_FOUND" && finding.status === "FAIL"));

  const invalidOutcome = clone(run);
  const searchEvent = invalidOutcome.proofEvents.find((event) => event.eventType === "search-assessment") as
    | { payload: { search: { resolution: string } } }
    | undefined;
  assert.ok(searchEvent);
  searchEvent.payload.search.resolution = "searched-not-found";
  assert.ok(validateOfflineSavedRun(invalidOutcome, testCase).findings.some((finding) =>
    finding.ruleId === "SEARCH_INCOMPLETE_AS_NOT_FOUND",
  ));
});

test("complete, partial, and conflicting evidence states remain separate from search resolution", () => {
  const { testCase, run } = baseline();
  const conflictingBase = {
    project: run.project,
    dimension: "electricity-tariff" as const,
    claim: "Conflicting published tariff observation.",
    value: 100,
    unit: "USD/MWh",
    valueStatus: "actual" as const,
    developmentQualifier: null,
    publicationDate: "2026-08-01",
    asOfDate: "2026-08-01",
    retainedPassageId: "conflict-passage",
    retainedPassage: "A source passage with a conflicting rate.",
    sourceIds: ["conflict-source"],
    sourceQualityClassification: "Verified Evidence" as const,
    eligibility: { eligible: true, reason: "Test fixture only." },
    supersedesEvidenceIds: [],
    researchRunId: null,
    observedAt: "2026-09-30T12:00:00.000Z",
  };
  run.proofEvents.push(
    proofEvent(run.project, "evidence-observation", {
      evidence: { ...conflictingBase, evidenceId: "tariff-observation-a", conflictsWithEvidenceIds: ["tariff-observation-b"] },
    }),
    proofEvent(run.project, "evidence-observation", {
      evidence: { ...conflictingBase, evidenceId: "tariff-observation-b", conflictsWithEvidenceIds: ["tariff-observation-a"], value: 120 },
    }),
  );
  run.proofEvents.push(
    proofEvent(run.project, "search-assessment", {
      search: {
        searchId: "complete-conflicting-tariff",
        project: run.project,
        dimension: "electricity-tariff",
        state: "complete",
        resolution: "conflicting",
        reason: "Retained sources report conflicting tariff values.",
        queryIds: ["query-1"],
        researchRunId: null,
        observedAt: "2026-09-30T12:00:00.000Z",
      },
    }),
    proofEvent(run.project, "search-assessment", {
      search: {
        searchId: "partial-water",
        project: run.project,
        dimension: "water-cooling",
        state: "partial",
        resolution: "not-assessed",
        reason: "Provider limit reached before all planned queries completed.",
        queryIds: ["query-2"],
        researchRunId: null,
        observedAt: "2026-09-30T12:00:00.000Z",
      },
    }),
  );
  const report = validateOfflineSavedRun(run, testCase);
  assert.ok(report.incompleteSearchDimensions.includes("water-cooling"));
  assert.ok(report.findings.some((finding) => finding.subject === "electricity-tariff" && finding.status === "REVIEW"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "EVIDENCE_CONFLICT_RETAINED" && finding.status === "REVIEW"));
  assert.equal(report.findings.some((finding) => finding.ruleId === "SEARCH_INCOMPLETE_AS_NOT_FOUND"), false);
});

test("likely non-public financial fields and unsupported project states are not promoted", () => {
  const { run } = baseline("sparse-unresolved-project");
  run.claims.push({
    claimId: "private-lease-terms",
    target: "tenant-lease-economics",
    kind: "tenant-counterparty",
    text: "The private lease guarantees USD 250 million in annual rent.",
    value: 250,
    unit: "USD millions per year",
    valueStatus: "actual",
    scope: run.project.scope,
    asOfDate: null,
    dimension: "tenant-counterparty",
    sourceEvidenceIds: [],
    retainedPassageIds: [],
  });
  run.proofEvents.push(proofEvent(run.project, "project-state-change", {
    state: {
      project: run.project,
      stateKey: "tenant-lease-status",
      state: { status: "known", value: "executed" },
      supportingEvidenceIds: ["missing-private-source"],
      stateVersion: "v1",
      asOfDate: null,
    },
  }));
  const report = validateOfflineSavedRun(run);
  assert.ok(report.unsupportedNumbers.includes("private-lease-terms"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "PROJECT_STATE_SUPPORT_UNVERIFIABLE" && finding.status === "FAIL"));
});

test("unsafe accepted model input is a blocker; a rejected unsupported proposal stays non-active", () => {
  const { run } = baseline();
  const rejected: TransmissionProposal = {
    proposalId: "reject-unsupported",
    project: run.project,
    sourceEvidenceIds: ["missing-source"],
    affectedVariable: "unknown-destination",
    currentValue: { value: null, unit: null },
    proposedValue: { value: 99, unit: "MW" },
    mechanism: "Unsupported test proposal.",
    quantificationClass: "qualitative",
    formula: null,
    supportLevel: "unsupported",
    status: "rejected",
    mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
  };
  run.proofEvents.push(proofEvent(run.project, "transmission-proposal", { proposal: rejected }));
  let report = validateOfflineSavedRun(run);
  assert.equal(report.financialProposals[0]?.disposition, "rejected; no model activation");
  assert.equal(report.findings.some((finding) => finding.ruleId === "FINANCIAL_MODEL_ACTIVE_SUPPORT" && finding.status === "FAIL"), false);

  const unsafe = clone(run);
  const proposalId = "accepted-unsupported";
  const target = "electricity_cost" as const;
  const proposal: TransmissionProposal = {
    proposalId,
    project: unsafe.project,
    sourceEvidenceIds: ["missing-source"],
    affectedVariable: expectedAffectedVariable(target),
    currentValue: { value: null, unit: "USD/MWh" },
    proposedValue: { value: 99, unit: "USD/MWh" },
    mechanism: "Unsupported test proposal.",
    quantificationClass: "qualitative",
    formula: financialTransmissionFormulaDescription(target),
    supportLevel: "unsupported",
    status: "accepted",
    mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
  };
  unsafe.proofEvents.push(proofEvent(unsafe.project, "transmission-proposal", { proposal }));
  unsafe.proofEvents.push(proofEvent(unsafe.project, "accepted-model-input", {
    input: {
      inputId: target,
      sourceEvidenceId: "missing-source",
      dimension: "electricity-tariff",
      value: 99,
      unit: "USD/MWh",
      acceptanceReason: "Accepted for negative test.",
    },
  }, "decision-missing"));
  report = validateOfflineSavedRun(unsafe);
  assert.ok(report.findings.some((finding) => finding.ruleId === "FINANCIAL_MODEL_ACTIVE_SUPPORT" && finding.status === "FAIL" && finding.severity === "BLOCKER"));
});

test("accepted transmission requires eligible evidence, current policy, and authenticated human acceptance", () => {
  const { run } = baseline();
  const target = "electricity_cost" as const;
  const proposalId = "accepted-supported";
  const evidenceId = "verified-evidence";
  const evidence = {
    evidenceId,
    project: run.project,
    dimension: "electricity-tariff" as const,
    claim: "Retained tariff schedule gives the approved rate.",
    value: 100,
    unit: "USD/MWh",
    valueStatus: "actual" as const,
    developmentQualifier: null,
    publicationDate: "2026-08-01",
    asOfDate: "2026-08-01",
    retainedPassageId: "tariff-rate-passage",
    retainedPassage: "Rate is USD 100 per MWh.",
    sourceIds: ["tariff-source"],
    sourceQualityClassification: "Verified Evidence" as const,
    eligibility: { eligible: true, reason: "Current, verified, fully searched." },
    conflictsWithEvidenceIds: [],
    supersedesEvidenceIds: [],
    researchRunId: null,
    observedAt: "2026-09-30T12:00:00.000Z",
  };
  const proposal: TransmissionProposal = {
    proposalId,
    project: run.project,
    sourceEvidenceIds: [evidenceId],
    affectedVariable: expectedAffectedVariable(target),
    currentValue: { value: null, unit: "USD/MWh" },
    proposedValue: { value: 100, unit: "USD/MWh" },
    mechanism: "Retained tariff evidence.",
    quantificationClass: "quantified",
    formula: financialTransmissionFormulaDescription(target),
    supportLevel: "supported",
    status: "accepted",
    mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
  };
  const decision: ProofUserDecision = {
    decisionId: "human-acceptance",
    project: run.project,
    actor: { kind: "authenticated", actorRef: "reviewer-1" },
    decision: "accept",
    targetRef: proposalId,
    rationale: "Accepted the eligible evidence.",
    decidedAt: "2026-09-30T12:00:00.000Z",
    versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "test-only" },
  };
  run.userDecisions.push(decision);
  run.proofEvents.push(
    proofEvent(run.project, "search-assessment", {
      search: {
        searchId: "complete-supported-electricity-tariff",
        project: run.project,
        dimension: "electricity-tariff",
        state: "complete",
        resolution: "supported",
        reason: null,
        queryIds: ["tariff-query"],
        researchRunId: null,
        observedAt: "2026-09-30T12:00:00.000Z",
      },
    }),
    proofEvent(run.project, "evidence-observation", { evidence }),
    proofEvent(run.project, "transmission-proposal", { proposal }),
    proofEvent(run.project, "accepted-model-input", {
      input: {
        inputId: target,
        sourceEvidenceId: evidenceId,
        dimension: "electricity-tariff",
        value: 100,
        unit: "USD/MWh",
        acceptanceReason: "Accepted after review.",
      },
    }, decision.decisionId),
  );
  const report = validateOfflineSavedRun(run);
  assert.ok(report.findings.some((finding) => finding.ruleId === "FINANCIAL_MODEL_ACTIVE_SUPPORT" && finding.status === "PASS"));

  const ineligible = clone(run);
  const evidenceEvent = ineligible.proofEvents.find((event) => {
    if (event.eventType !== "evidence-observation") return false;
    const payload = event as unknown as { payload: { evidence?: { evidenceId?: string } } };
    return payload.payload.evidence?.evidenceId === evidenceId;
  });
  assert.ok(evidenceEvent);
  const evidencePayload = evidenceEvent as unknown as {
    payload: { evidence: { eligibility: { eligible: boolean } } };
  };
  evidencePayload.payload.evidence.eligibility.eligible = false;
  const ineligibleReport = validateOfflineSavedRun(ineligible);
  assert.ok(ineligibleReport.findings.some((finding) =>
    finding.ruleId === "FINANCIAL_MODEL_ACTIVE_SUPPORT" && finding.status === "FAIL" && finding.severity === "BLOCKER",
  ));
});

test("illustrative regression inputs cannot be relabeled as factual project claims", () => {
  const { testCase, run } = baseline("illustrative-small-colocation-profile");
  const bad = clone(run);
  bad.origin = "retained-repository-fixture";
  bad.claims.push({
    claimId: "invented-small-colo-capacity",
    target: "facility-it-capacity",
    kind: "capacity",
    text: "This real facility has 8 MW.",
    value: 8,
    unit: "MW",
    valueStatus: "actual",
    scope: testCase.project.scope,
    asOfDate: null,
    sourceEvidenceIds: [],
    retainedPassageIds: [],
  });
  const report = validateOfflineSavedRun(bad, testCase);
  assert.ok(report.findings.some((finding) => finding.ruleId === "ILLUSTRATIVE_FIXTURE_AS_FACT" && finding.status === "FAIL"));
  assert.ok(report.findings.some((finding) => finding.ruleId === "CLAIM_SOURCE_OR_PASSAGE_UNSUPPORTED" && finding.status === "FAIL"));
});
