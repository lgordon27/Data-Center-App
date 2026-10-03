import assert from "node:assert/strict";
import test from "node:test";
import { createResearchFunnelDiagnostics } from "./researchFunnelDiagnostics.mjs";

test("all categories retain issued passage lineage without modifying the production packet", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  const packet = [{ canonicalUrl: "https://records.example.gov/water", passage: "Cedar Campus has a municipal water agreement.", title: "Water agreement" }];
  const before = structuredClone(packet);
  for (const categoryId of ["project-identity", "grid", "water", "construction-capital", "permitting-community", "tenant-counterparty", "electricity", "climate-operational-hazard"]) {
    diagnostics.claimTrace.recordAnalysisPacket({ categoryId, packet });
    diagnostics.claimTrace.recordAnalysisPacket({ categoryId, providerResponseId: `response-${categoryId}` });
  }
  const capture = diagnostics.toJSON();
  assert.equal(capture.analysisPackets.length, 8);
  assert.ok(capture.analysisPackets.every((batch) => batch.providerResponseId && batch.passages[0].passageSha256));
  assert.deepEqual(packet, before);
  capture.analysisPackets.length = 0;
  assert.equal(diagnostics.toJSON().analysisPackets.length, 8);
});

test("receipts preserve reuse and blocked access while sanitizing sensitive URLs and text", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  diagnostics.collector.recordDiscoveryCandidates([{
    url: "https://records.example.gov/filing?token=private&record=23",
    sourceFamily: "government-project-record", acquisitionRank: 1,
  }]);
  diagnostics.collector.recordPhysicalReceipt({
    candidate: { url: "https://records.example.gov/filing" },
    accessOutcome: { state: "blocked", reason: "Bearer private", physicalOpenIndex: 1 },
    reused: true,
  });
  diagnostics.claimTrace.recordAnalysisPacket({
    categoryId: "water", packet: [{
      canonicalUrl: "https://records.example.gov/filing?token=private",
      passage: "Cedar Campus: token=private and api_key=private. Public record.",
    }],
  });
  const capture = diagnostics.toJSON();
  assert.equal(capture.receipts[0].reused, true);
  assert.equal(capture.receipts[0].state, "blocked");
  assert.equal(capture.candidates[0].sourceFamily, "government-project-record");
  assert.doesNotMatch(JSON.stringify(capture), /private/);
});

test("diagnostics are bounded and unexecuted work is never synthesized", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  diagnostics.collector.recordDiscoveryCandidates(Array.from({ length: 90 }, (_, index) => ({ url: `https://records.example.gov/${index}` })));
  const capture = diagnostics.toJSON();
  assert.equal(capture.observedCandidates, 90);
  assert.equal(capture.candidates.length, 80);
  assert.equal(capture.candidatesTruncated, true);
  assert.deepEqual(capture.analysisPackets, []);
  assert.deepEqual(capture.authorizations, []);
});

test("captures a bounded original category exception without credentials or stack", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  for (let index = 0; index < 12; index += 1) diagnostics.collector.recordEngineFailure({
    categoryId: "project-identity", stage: "category-orchestration",
    error: new TypeError("Failed at https://records.example.gov/a?token=private; Bearer private"),
  });
  const failures = diagnostics.toJSON().engineFailures;
  assert.equal(failures.length, 8);
  assert.equal(failures[0].errorName, "TypeError");
  assert.equal(failures[0].stage, "category-orchestration");
  assert.doesNotMatch(JSON.stringify(failures), /private|stack|authorization/i);
});

test("records occurrence-stage hashes and links prepared passages to provider issue state without saving raw passage text", () => {
  const diagnostics = createResearchFunnelDiagnostics({
    runId: "run-funnel-1",
    project: { projectId: "project-funnel-1", name: "Cedar Campus" },
  });
  const passage = "RAW-PASSAGE-ONLY-MARKER: Cedar Campus interconnects at 480 MW.";
  const source = {
    sourceId: "source-1",
    occurrenceId: "occurrence-1",
    originalUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/OPAQUE_TOKEN_0123456789",
    canonicalUrl: "https://records.example.gov/cedar?signature=PRIVATE_SIGNATURE",
    sourceFamily: "public-project-filing",
    categoryIds: ["grid"],
    facilityScope: "Cedar Campus",
    phaseScope: "Phase 1",
    campusScope: "Cedar Campus",
    buildingScope: "Building A",
    accessOutcome: { state: "accessible", passage },
  };
  const prepared = diagnostics.claimTrace.recordProviderEvent({
    state: "prepared",
    runId: "run-funnel-1",
    projectId: "project-funnel-1",
    categoryId: "grid",
    attemptType: "primary",
    attemptId: "grid:primary:attempt-1",
    packet: [{
      sourceId: source.sourceId,
      canonicalUrl: source.canonicalUrl,
      passage,
      categoryIds: ["grid"],
      facilityScope: source.facilityScope,
      phaseScope: source.phaseScope,
      campusScope: source.campusScope,
      buildingScope: source.buildingScope,
    }],
    requestBodySha256: "a".repeat(64),
    bodyBytes: 8192,
    estimatedInputTokens: 2048,
    outcome: "prepared-not-yet-issued",
  });
  diagnostics.claimTrace.recordPassageSelection({
    runId: "run-funnel-1",
    projectId: "project-funnel-1",
    categoryId: "grid",
    attemptType: "primary",
    attemptId: prepared.attemptId,
    records: [{
      source,
      sourceId: source.sourceId,
      occurrenceId: source.occurrenceId,
      included: false,
      decision: "excluded-before-passage-selection",
      reasonCode: "identity-not-established",
      explanation: "The shared resolver returned ambiguous.",
      routeState: "matched",
      routeReason: "category route accepted",
      identityAdmission: {
        state: "evaluated",
        verdict: "ambiguous",
        reason: "The shared resolver returned ambiguous.",
      },
      identityTrace: {
        resolver: { verdict: "ambiguous", reason: "The shared resolver returned ambiguous." },
        actors: [],
      },
      deduplicationState: "not-evaluated",
      windowState: "not-evaluated",
      tokenFitState: "not-evaluated",
      passageRetained: "retained",
      postFilterPassage: passage,
      deduplicatedPassage: passage,
      windowedPassage: "",
      suppliedPassage: "",
    }],
  });
  diagnostics.claimTrace.recordProviderEvent({
    state: "issued-to-provider",
    runId: "run-funnel-1",
    projectId: "project-funnel-1",
    categoryId: "grid",
    attemptType: "primary",
    attemptId: prepared.attemptId,
    providerCallStartedAt: "2026-10-03T01:00:00.000Z",
    packet: [],
    outcome: "issued",
  });

  const capture = diagnostics.toJSON();
  const selection = capture.passageSelections[0];
  assert.equal(selection.runId, "run-funnel-1");
  assert.equal(selection.occurrenceId, "occurrence-1");
  assert.equal(selection.categoryId, "grid");
  assert.equal(selection.attemptId, prepared.attemptId);
  assert.equal(selection.inclusion.reasonCode, "identity-not-established");
  assert.equal(selection.inclusion.issueStateAtSelection, "prepared-before-provider-gate");
  assert.equal(selection.inclusion.issueOutcomeLinkedByAttemptId, true);
  assert.equal(selection.original.length, passage.length);
  assert.match(selection.original.sha256, /^[a-f0-9]{64}$/);
  assert.equal(selection.finalSupplied.length, 0);
  assert.deepEqual(capture.providerEvents.map((event) => event.state), ["prepared", "issued-to-provider"]);
  assert.equal(capture.providerEvents[0].sourceIds[0].passageLength, passage.length);
  assert.equal(capture.providerEvents[0].requestBodySha256, "a".repeat(64));
  assert.doesNotMatch(JSON.stringify(capture), /RAW-PASSAGE-ONLY-MARKER|OPAQUE_TOKEN|PRIVATE_SIGNATURE/);
});

test("keeps provider-original values immutable and distinguishes supported, wrong-passage, and placeholder records", () => {
  const diagnostics = createResearchFunnelDiagnostics({
    runId: "run-claims-1",
    project: { projectId: "project-claims-1", name: "Vantage AZ1" },
  });
  const url = "https://records.example.gov/vantage-az1";
  const exactQuote = "Vantage AZ1 has 160 MW of planned capacity.";
  const source = {
    occurrenceId: "occurrence-az1",
    canonicalUrl: url,
    accessOutcome: { state: "accessible", passage: `The Vantage AZ1 record states: ${exactQuote}` },
    sourceValidation: { state: "accepted" },
  };
  const providerOriginal = {
    projectSummary: { name: "Vantage AZ1", description: "A public project summary." },
    identityAssessment: { exactProjectIdentityEstablished: true, matchedName: "Vantage AZ1" },
    evidence: {
      grid_interconnection: {
        claimType: "grid_interconnection",
        value: 160,
        unit: "MW",
        status: "planned",
        classification: "project-reported",
        claimPassage: exactQuote,
        sourceUrl: url,
        sourceUrls: [url],
        matchedName: "Vantage AZ1",
        matchedOperator: "Vantage Data Centers",
        facilityScope: "facility",
        phaseScope: "Phase 1",
        claimTimePeriod: "2026-09-01",
        sourceRelevance: "exact-project",
        confidence: "high",
      },
    },
  };
  diagnostics.claimTrace.recordProviderOriginal({
    categoryId: "grid",
    providerResponseId: "response-grid-1",
    expectedEvidenceIds: ["grid_interconnection"],
    research: providerOriginal,
  });
  const transformed = structuredClone(providerOriginal);
  transformed.evidence.grid_interconnection.value = 0;
  transformed.evidence.grid_interconnection.sourceUrl = null;
  diagnostics.claimTrace.recordTransformation({
    categoryId: "grid",
    providerResponseId: "response-grid-1",
    stage: "accepted-source-restriction",
    reason: "The citation did not resolve to an accepted retained source.",
    before: providerOriginal,
    after: transformed,
  });
  providerOriginal.evidence.grid_interconnection.value = 999;

  const wrongPassage = {
    occurrenceId: "occurrence-az2",
    canonicalUrl: url,
    accessOutcome: { state: "accessible", passage: "The Vantage AZ2 record describes a separate project." },
  };
  const correctPassage = {
    occurrenceId: "occurrence-az1-correct",
    canonicalUrl: url,
    accessOutcome: { state: "accessible", passage: `${exactQuote} Permit XYZ was issued.` },
  };
  diagnostics.claimTrace.recordMappingReceipts({
    categoryId: "grid",
    evidence: [
      {
        id: "grid_interconnection",
        value: 160,
        unit: "MW",
        status: "planned",
        claimPassage: exactQuote,
        sourceUrl: `${url}?token=PRIVATE_TOKEN`,
        citations: [`${url}?signature=PRIVATE_SIGNATURE`],
        sources: [source],
        claimMappings: [{
          sourceId: url,
          occurrenceId: "occurrence-az1",
          passageId: "passage-az1",
          exactQuotation: exactQuote,
          supportStatus: "supported",
          sourceTypeState: "passed",
          projectSpecificityState: "project-specific",
          entityScope: "project",
        }],
      },
      {
        id: "water_rights",
        value: 2,
        unit: "permits",
        claimPassage: "Permit XYZ was issued.",
        sources: [wrongPassage, correctPassage],
        claimMappings: [{
          sourceId: url,
          occurrenceId: "occurrence-az2",
          passageId: "passage-az2",
          exactQuotation: "Permit XYZ was issued.",
          supportStatus: "supported",
          entityScope: "project",
        }],
      },
      {
        id: "electricity_cost",
        value: "Missing Evidence",
        classification: "Missing Evidence",
      },
      { id: "schema-only", classification: "unknown" },
    ],
  });

  const capture = diagnostics.toJSON();
  assert.equal(capture.providerOriginals[0].immutable, true);
  assert.equal(capture.providerOriginals[0].evidence[0].value, 160);
  assert.equal(capture.providerOriginals[0].evidence[0].claimPassage, exactQuote);
  assert.ok(capture.transformations[0].diffs.some((diff) =>
    diff.claimId === "grid_interconnection" && diff.field === "value"
      && diff.oldValue === 160 && diff.newValue === 0));
  assert.ok(capture.transformations[0].diffs.some((diff) =>
    diff.claimId === "grid_interconnection" && diff.field === "sourceUrl"));
  assert.deepEqual(capture.mappingReceipts.map((record) => record.candidateKind), [
    "substantive-candidate",
    "substantive-candidate",
    "unavailable-value-placeholder",
    "non-substantive-schema-entry",
  ]);
  assert.equal(capture.mappingReceipts[0].mappings[0].failureKind, "none");
  assert.equal(capture.mappingReceipts[0].mappings[0].quoteContainment, "contained-in-retained-passage");
  assert.equal(capture.mappingReceipts[1].mappings[0].failureKind, "wrong-retained-passage");
  assert.equal(capture.mappingReceipts[2].substantive, false);
  assert.deepEqual(capture.mappingReceiptKinds, {
    substantiveCandidates: 2,
    unavailableValuePlaceholders: 1,
    nonSubstantiveSchemaEntries: 1,
  });
  assert.doesNotMatch(JSON.stringify(capture), /PRIVATE_TOKEN|PRIVATE_SIGNATURE/);
});