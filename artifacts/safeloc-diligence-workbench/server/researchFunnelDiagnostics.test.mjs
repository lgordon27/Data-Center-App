import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createResearchFunnelDiagnostics } from "./researchFunnelDiagnostics.mjs";
import {
  consumeAcceptanceCaptureOptIn,
  createLocalAcceptanceCapture,
} from "./researchAcceptanceCapture.mjs";

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
    preparedAt: "2026-10-03T00:59:59.000Z",
    issueOutcome: "prepared",
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
    issueOutcome: "issued-with-text",
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
  assert.deepEqual(capture.providerEvents.map((event) => event.issueOutcome), ["prepared", "issued-with-text"]);
  assert.ok(capture.providerEvents.every((event) =>
    event.runId === "run-funnel-1"
    && event.projectId === "project-funnel-1"
    && event.categoryId === "grid"
    && event.attemptId === prepared.attemptId));
  assert.equal(capture.providerEvents[0].sourceIds[0].passageLength, passage.length);
  assert.equal(capture.providerEvents[0].requestBodySha256, "a".repeat(64));
  assert.doesNotMatch(JSON.stringify(capture), /RAW-PASSAGE-ONLY-MARKER|OPAQUE_TOKEN|PRIVATE_SIGNATURE/);
});

test("retains distinct unissued-empty and failed-before-issue outcomes with attempt lineage", () => {
  const diagnostics = createResearchFunnelDiagnostics({
    runId: "run-empty-outcomes",
    project: { projectId: "project-empty-outcomes", name: "Cedar Campus" },
  });
  const lineage = {
    runId: "run-empty-outcomes",
    projectId: "project-empty-outcomes",
    categoryId: "grid",
    attemptType: "primary",
    preparedAt: "2026-10-03T00:59:59.000Z",
  };
  const emptyAttemptId = diagnostics.claimTrace.recordProviderEvent({
    ...lineage,
    state: "prepared",
    attemptId: "grid:primary:empty-attempt",
    issueOutcome: "prepared",
  }).attemptId;
  diagnostics.claimTrace.recordProviderEvent({
    ...lineage,
    state: "unissued-empty",
    attemptId: emptyAttemptId,
    issueOutcome: "unissued-empty",
    outcome: "not-assessed",
    reason: "Not assessed: no admitted passage text.",
  });

  const failedAttemptId = diagnostics.claimTrace.recordProviderEvent({
    ...lineage,
    state: "prepared",
    attemptId: "grid:primary:failed-attempt",
    issueOutcome: "prepared",
  }).attemptId;
  diagnostics.claimTrace.recordProviderEvent({
    ...lineage,
    state: "failed-before-issue",
    attemptId: failedAttemptId,
    issueOutcome: "failed-before-issue",
    outcome: "provider-deadline-admission",
  });

  const events = diagnostics.toJSON().providerEvents;
  assert.deepEqual(events.map((event) => event.state), [
    "prepared", "unissued-empty", "prepared", "failed-before-issue",
  ]);
  assert.deepEqual(events.map((event) => event.issueOutcome), [
    "prepared", "unissued-empty", "prepared", "failed-before-issue",
  ]);
  assert.deepEqual(events.map((event) => event.attemptId), [
    emptyAttemptId, emptyAttemptId, failedAttemptId, failedAttemptId,
  ]);
  assert.ok(events.every((event) =>
    event.runId === lineage.runId
    && event.projectId === lineage.projectId
    && event.categoryId === lineage.categoryId
    && event.attemptType === lineage.attemptType));
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

test("one-use acceptance capture round-trips exact text with admission, provider, and validation lineage", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "safeloc-acceptance-capture-test-"));
  const markerPath = path.join(temporary, "opt-in.json");
  const rootDirectory = path.join(temporary, "captures");
  const runId = randomUUID();
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: { operator: "DataBank", city: "Red Oak", county: "Ellis County", state: "Texas" },
    projectIdentity: {
      projectId: null,
      providerId: null,
      name: "Red Oak Campus",
      location: "Red Oak, Ellis County, Texas",
      operator: "DataBank",
    },
  };
  try {
    writeFileSync(markerPath, JSON.stringify({
      version: 1,
      enabled: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      projectName: "Red Oak Campus",
      location: "Red Oak, Ellis County, Texas",
      operator: "DataBank",
    }), { mode: 0o600 });
    chmodSync(markerPath, 0o600);
    const sink = consumeAcceptanceCaptureOptIn({ project, runId, markerPath, rootDirectory });
    assert.ok(sink);
    assert.equal(existsSync(markerPath), false);
    assert.equal(consumeAcceptanceCaptureOptIn({ project, runId: randomUUID(), markerPath, rootDirectory }), null);

    const passage = "Red Oak Campus has a public interconnection application for 480 MW.";
    const prompt = "Assess only the retained Red Oak passage. Do not infer other campus facts.";
    const providerOutput = JSON.stringify({
      evidence: [{
        id: "grid_interconnection",
        value: 480,
        unit: "MW",
        claimPassage: "Red Oak Campus has a public interconnection application for 480 MW.",
        sourceUrl: "https://records.example.gov/red-oak/interconnection",
      }],
    });
    const providerOriginalClaims = {
      projectSummary: {
        name: "Red Oak Campus",
        location: "Red Oak, Ellis County, Texas",
        description: "The provider-original project summary.",
      },
      evidence: [{
        id: "grid_interconnection",
        value: 480,
        unit: "MW",
        claimPassage: passage,
        sources: [{
          sourceId: "red-oak-source-1",
          url: "https://records.example.gov/red-oak/interconnection",
        }],
      }],
    };
    const diagnostics = createResearchFunnelDiagnostics({
      runId,
      project: { ...project, projectId: "Red Oak Campus" },
      acceptanceCapture: sink,
    });
    diagnostics.claimTrace.recordPassageSelection({
      runId,
      projectId: "Red Oak Campus",
      categoryId: "grid",
      attemptType: "primary",
      attemptId: "grid:primary:attempt-1",
      records: [{
        source: {
          sourceId: "red-oak-source-1",
          occurrenceId: "red-oak-occurrence-1",
          canonicalUrl: "https://records.example.gov/red-oak/interconnection",
          accessOutcome: { state: "accessible", passage },
        },
        occurrenceId: "red-oak-occurrence-1",
        included: false,
        decision: "excluded-before-passage-selection",
        reasonCode: "category-route-mismatch",
        routeState: "excluded",
        identityAdmission: { state: "admitted", verdict: "project-specific" },
        passageRetained: "retained",
      }],
    });
    diagnostics.claimTrace.recordAnalysisPacket({
      runId,
      projectId: "Red Oak Campus",
      categoryId: "grid",
      attemptType: "primary",
      attemptId: "grid:primary:attempt-1",
      requestBodySha256: "a".repeat(64),
      packet: [{
        sourceId: "red-oak-source-1",
        occurrenceId: "red-oak-occurrence-1",
        sourceUrl: "https://records.example.gov/red-oak/interconnection",
        passage,
      }],
      analysisUserMessages: [prompt],
    });
    diagnostics.claimTrace.recordProviderOutput({
      runId,
      projectId: "Red Oak Campus",
      categoryId: "grid",
      attemptType: "primary",
      attemptId: "grid:primary:attempt-1",
      providerResponseId: "resp-red-oak-1",
      sourceIds: ["red-oak-source-1"],
      content: providerOutput,
    });
    diagnostics.claimTrace.recordProviderOriginal({
      runId,
      projectId: "Red Oak Campus",
      categoryId: "grid",
      attemptType: "primary",
      attemptId: "grid:primary:attempt-1",
      providerResponseId: "resp-red-oak-1",
      expectedEvidenceIds: ["grid_interconnection"],
      research: providerOriginalClaims,
    });
    diagnostics.claimTrace.recordMappingReceipts({
      runId,
      projectId: "Red Oak Campus",
      categoryId: "grid",
      attemptType: "primary",
      attemptId: "grid:primary:attempt-1",
      providerResponseId: "resp-red-oak-1",
      evidence: [{
        id: "grid_interconnection",
        value: 480,
        unit: "MW",
        eligibleForModel: true,
        sources: [{
          sourceId: "red-oak-source-1",
          occurrenceId: "red-oak-occurrence-1",
          url: "https://records.example.gov/red-oak/interconnection",
        }],
      }],
    });
    sink.finalize({ status: "completed" });

    const filePath = sink.filePath;
    const records = readFileSync(filePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const recordFor = (stage) => records.find((record) => record.stage === stage);
    const admission = recordFor("admission-retained-passage");
    const packet = recordFor("final-analysis-packet");
    const finalPrompt = recordFor("final-analysis-user-message");
    const rawClaim = recordFor("provider-claim-content-before-normalization");
    const structuredClaims = recordFor("provider-original-structured-claims");
    const validated = recordFor("validated-evidence");
    for (const [label, record] of Object.entries({
      admission,
      packet,
      finalPrompt,
      rawClaim,
      structuredClaims,
      validated,
    })) {
      assert.ok(record, `missing ${label} record`);
    }
    assert.equal(admission.content.text, passage);
    assert.equal(admission.content.exactOriginal, true);
    assert.equal(admission.content.originalSha256, createHash("sha256").update(passage).digest("hex"));
    assert.equal(admission.lineage.decision, "excluded-before-passage-selection");
    assert.equal(admission.lineage.sourceId, "red-oak-source-1");
    assert.equal(packet.content.exactOriginal, true);
    assert.equal(packet.content.originalSha256, createHash("sha256").update(packet.content.text).digest("hex"));
    assert.equal(JSON.parse(packet.content.text)[0].passage, passage);
    assert.equal(packet.lineage.runId, runId);
    assert.equal(packet.lineage.projectId, "Red Oak Campus");
    assert.equal(packet.lineage.categoryId, "grid");
    assert.equal(packet.lineage.attemptId, "grid:primary:attempt-1");
    assert.deepEqual(packet.lineage.sourceIds, ["red-oak-source-1", "red-oak-occurrence-1", "https://records.example.gov/red-oak/interconnection"]);
    assert.equal(finalPrompt.content.text, prompt);
    assert.equal(finalPrompt.content.originalSha256, createHash("sha256").update(prompt).digest("hex"));
    assert.equal(finalPrompt.lineage.attemptId, "grid:primary:attempt-1");
    assert.equal(rawClaim.content.text, providerOutput);
    assert.equal(rawClaim.content.exactOriginal, true);
    assert.equal(rawClaim.content.originalSha256, createHash("sha256").update(providerOutput).digest("hex"));
    assert.equal(rawClaim.lineage.providerResponseId, "resp-red-oak-1");
    assert.deepEqual(rawClaim.lineage.sourceIds, ["red-oak-source-1"]);
    assert.equal(rawClaim.lineage.sourceRepresentation, "provider-content-text-from-sdk");
    assert.equal(structuredClaims.content.exactOriginal, true);
    assert.deepEqual(JSON.parse(structuredClaims.content.text), providerOriginalClaims);
    assert.equal(structuredClaims.lineage.runId, runId);
    assert.equal(structuredClaims.lineage.projectId, "Red Oak Campus");
    assert.equal(structuredClaims.lineage.categoryId, "grid");
    assert.equal(structuredClaims.lineage.attemptId, "grid:primary:attempt-1");
    assert.equal(structuredClaims.lineage.providerResponseId, "resp-red-oak-1");
    assert.deepEqual(structuredClaims.lineage.sourceIds, ["red-oak-source-1", "https://records.example.gov/red-oak/interconnection"]);
    assert.equal(structuredClaims.lineage.sourceRepresentation, "parsed-provider-original-structured-output");
    assert.equal(validated.lineage.claimId, "grid_interconnection");
    assert.equal(validated.lineage.attemptId, "grid:primary:attempt-1");
    assert.equal(validated.lineage.providerResponseId, "resp-red-oak-1");
    assert.deepEqual(validated.lineage.sourceIds, ["red-oak-source-1"]);
    assert.equal(statSync(path.dirname(filePath)).mode & 0o777, 0o700);
    assert.equal(statSync(filePath).mode & 0o777, 0o600);
    const readBack = sink.readBack();
    assert.equal(readBack.runId, runId);
    assert.equal(readBack.sha256, createHash("sha256").update(readFileSync(filePath)).digest("hex"));
    assert.equal(readBack.records.length, records.length);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("acceptance capture flags redaction, truncation, and run-size overflow without exporting secrets", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "safeloc-acceptance-capture-limits-"));
  try {
    const redactionCapture = createLocalAcceptanceCapture({
      runId: randomUUID(),
      rootDirectory: path.join(temporary, "redaction"),
      limits: { maxTextBytes: 110 },
    });
    const sensitive = `Bearer bearer-secret token=private-secret https://records.example.gov/file?api_key=url-secret 192.168.1.22 {"authorization":"Bearer json-secret","x-api-key":"header-secret"} ${"x".repeat(240)}`;
    redactionCapture.writeText({ stage: "safety-test", text: sensitive });
    redactionCapture.writeStructured({
      stage: "safety-structured-test",
      value: {
        evidence: [{ id: "safe-claim", value: 1 }],
        authorization: "Bearer structured-secret",
        headers: { "x-api-key": "structured-header-secret" },
        requestId: "transport-request-id",
        response_headers: { authorization: "response-header-secret" },
        http_request_options: { url: "https://internal.example/private" },
        remote_address: "10.0.0.10",
      },
    });
    redactionCapture.finalize({ status: "test" });
    const redactedRecords = readFileSync(redactionCapture.filePath, "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    const redacted = redactedRecords.find((record) => record.stage === "safety-test");
    assert.equal(redacted.content.originalSha256, createHash("sha256").update(sensitive).digest("hex"));
    assert.equal(redacted.content.exactOriginal, false);
    assert.equal(redacted.content.altered, true);
    assert.equal(redacted.content.truncated, true);
    assert.ok(redacted.content.alterationReasons.includes("bearer-credential"));
    assert.ok(redacted.content.alterationReasons.includes("sensitive-url-query"));
    assert.ok(redacted.content.alterationReasons.includes("private-network-address"));
    assert.ok(redacted.content.alterationReasons.includes("capture-size-limit"));
    assert.ok(redacted.content.alterationReasons.includes("credential-property"));
    assert.doesNotMatch(redacted.content.text, /bearer-secret|private-secret|url-secret|json-secret|header-secret|192\.168\.1\.22/);
    const structuredSafetyRecord = redactedRecords.find((record) => record.stage === "safety-structured-test");
    assert.equal(structuredSafetyRecord.content.exactOriginal, false);
    assert.ok(structuredSafetyRecord.content.alterationReasons.includes("sensitive-structured-field-excluded"));
    assert.equal(structuredSafetyRecord.content.truncated, false);
    assert.doesNotMatch(
      structuredSafetyRecord.content.text,
      /structured-secret|structured-header-secret|response-header-secret|transport-request-id|internal\.example|10\.0\.0\.10|authorization|headers|requestId|remote_address/,
    );

    const structuredTruncationCapture = createLocalAcceptanceCapture({
      runId: randomUUID(),
      rootDirectory: path.join(temporary, "structured-truncation"),
    });
    structuredTruncationCapture.writeStructured({
      stage: "safety-structured-truncation-test",
      value: { claims: Array.from({ length: 65 }, (_, index) => ({ id: `claim-${index}` })) },
    });
    structuredTruncationCapture.finalize({ status: "test" });
    const structuredTruncationRecord = structuredTruncationCapture.readBack().records
      .find((record) => record.stage === "safety-structured-truncation-test");
    assert.equal(structuredTruncationRecord.content.exactOriginal, false);
    assert.equal(structuredTruncationRecord.content.truncated, true);
    assert.ok(structuredTruncationRecord.content.alterationReasons.includes("metadata-array-item-limit"));

    const overflowCapture = createLocalAcceptanceCapture({
      runId: randomUUID(),
      rootDirectory: path.join(temporary, "overflow"),
      limits: { maxTextBytes: 350, maxRecordBytes: 4_096, maxTotalBytes: 4_096 },
    });
    for (let index = 0; index < 20; index += 1) {
      overflowCapture.writeText({ stage: `bounded-${index}`, text: "x".repeat(300) });
    }
    const finalStatus = overflowCapture.finalize({ status: "overflow-test" });
    const overflowRecords = readFileSync(overflowCapture.filePath, "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    const summary = overflowRecords.find((record) => record.type === "capture-summary");
    assert.equal(summary.overflowWritten, true);
    assert.ok(summary.recordsDropped > 0);
    assert.equal(finalStatus.overflowWritten, true);
    assert.ok(finalStatus.bytesWritten <= 4_096);
    assert.equal(overflowCapture.readBack().bytes, finalStatus.bytesWritten);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("acceptance capture remains disabled by default and adds no exact passage text to bounded diagnostics", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "safeloc-acceptance-capture-disabled-"));
  try {
    const runId = randomUUID();
    const passage = "DISABLED_CAPTURE_SENTINEL: source text must not enter ordinary diagnostics.";
    const project = {
      name: "Red Oak Campus",
      location: "Red Oak, Ellis County, Texas",
      knownData: { operator: "DataBank" },
      projectIdentity: { projectId: null, providerId: null, operator: "DataBank" },
    };
    const disabled = createResearchFunnelDiagnostics({ runId, project });
    assert.deepEqual(disabled.acceptanceCaptureStatus(), { enabled: false });
    disabled.claimTrace.recordPassageSelection({
      runId,
      categoryId: "grid",
      attemptId: "grid:primary:disabled",
      records: [{
        source: { sourceId: "source-disabled", accessOutcome: { state: "accessible", passage } },
        included: true,
      }],
    });
    assert.doesNotMatch(JSON.stringify(disabled.toJSON()), /DISABLED_CAPTURE_SENTINEL/);
    const markerPath = path.join(temporary, "wrong-project-opt-in.json");
    writeFileSync(markerPath, JSON.stringify({
      version: 1,
      enabled: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      projectName: "Different Campus",
      location: "Red Oak, Ellis County, Texas",
      operator: "DataBank",
    }), { mode: 0o600 });
    chmodSync(markerPath, 0o600);
    assert.equal(consumeAcceptanceCaptureOptIn({
      project,
      runId,
      markerPath,
      rootDirectory: path.join(temporary, "wrong-project-captures"),
    }), null);
    assert.equal(existsSync(markerPath), true);
    assert.equal(existsSync(path.join(temporary, "wrong-project-captures")), false);
    assert.equal(consumeAcceptanceCaptureOptIn({
      project,
      runId,
      markerPath: path.join(temporary, "missing-opt-in.json"),
      rootDirectory: path.join(temporary, "captures"),
    }), null);
    assert.equal(existsSync(path.join(temporary, "captures")), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});