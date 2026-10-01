import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RESEARCH_CATEGORIES,
  RESEARCH_RUN_BUDGET,
} from "./researchProjectProxy.mjs";
import {
  RED_OAK_GRID_CANARY_LIMITS,
  RED_OAK_RETRIEVAL_ONLY_CANARY_LIMITS,
  buildAcceptanceReport,
  buildRedOakGridCanaryRequestOptions,
  canaryCandidateCount,
  canaryContentQualityObservations,
  canaryPhysicalReceiptCompleteness,
  canaryRemainingBlockers,
  canaryRetrievalPassageAudit,
  createRedOakCanaryDiagnosticCollector,
  createRedOakCanaryResources,
  markGridSuppliedCandidates,
  parseRedOakCanaryCliArguments,
  runRedOakGridCanary,
} from "./researchProjectAcceptance.mjs";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";

test("Red Oak live canary requires explicit opt-in before inspecting gate files or issuing requests", async () => {
  await assert.rejects(
    runRedOakGridCanary({
      optIn: false,
      preconditionsPath: "/path-that-must-not-be-read",
      apiKey: "offline-test-key",
      googleApiKey: "offline-test-key",
    }),
    /explicit --live opt-in; no requests were issued/,
  );
});

test("Red Oak canary request options encode the exact isolated scope and hard limits", () => {
  const options = buildRedOakGridCanaryRequestOptions({
    apiKey: "offline",
    googleApiKey: "offline",
    cache: {},
    registry: {},
    auditRepository: {},
    rateLimiter: {},
    claimTrace: {},
    signal: new AbortController().signal,
  });

  assert.deepEqual(options.categoryIds, ["project-identity", "grid"]);
  assert.equal(options.researchBudgetOverrides.maxProviderRequests, 3);
  assert.equal(options.researchBudgetOverrides.maxPhysicalDocumentOpens, 8);
  assert.equal(options.researchBudgetOverrides.maxFollowUps, 0);
  assert.equal(options.researchBudgetOverrides.maxFollowUpsPerCategory, 0);
  assert.equal(options.allowGoogleFallback, false);
  assert.equal(options.allowCorrectiveRetries, false);
  assert.equal(options.allowProviderRetries, false);
  assert.equal(options.useDefaultSecConnector, false);
  assert.match(options.googleDiscoveryPrompt, /only exact project identity and electric grid\/interconnection evidence/i);
  assert.equal(options.researchTimeoutMs, 75_000);
  assert.equal(RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs, 90_000);
});

test("Red Oak retrieval-only canary stops after one discovery and eight bounded physical opens", () => {
  const options = buildRedOakGridCanaryRequestOptions({
    apiKey: null,
    googleApiKey: "offline",
    cache: {},
    registry: {},
    auditRepository: {},
    rateLimiter: {},
    claimTrace: {},
    signal: new AbortController().signal,
    retrievalOnly: true,
  });

  assert.equal(options.retrievalOnly, true);
  assert.equal(options.apiKey, null);
  assert.deepEqual(options.categoryIds, ["project-identity", "grid"]);
  assert.equal(options.researchBudgetOverrides.maxProviderRequests, 1);
  assert.equal(options.researchBudgetOverrides.maxPhysicalDocumentOpens, 8);
  assert.equal(options.researchBudgetOverrides.maxFollowUps, 0);
  assert.equal(options.allowGoogleFallback, false);
  assert.equal(options.allowCorrectiveRetries, false);
  assert.equal(options.allowProviderRetries, false);
  assert.equal(options.researchTimeoutMs, 75_000);
  assert.equal(RED_OAK_RETRIEVAL_ONLY_CANARY_LIMITS.structuredProviderCalls, 0);
  assert.equal(RED_OAK_RETRIEVAL_ONLY_CANARY_LIMITS.totalProviderRequests, 1);
  assert.equal(RED_OAK_RETRIEVAL_ONLY_CANARY_LIMITS.invocationTimeoutMs, 90_000);
  assert.match(options.googleDiscoveryPrompt, /only exact project identity and electric grid\/interconnection evidence/i);
});

test("pnpm-forwarded separator is accepted before the canary live and gates options", () => {
  assert.deepEqual(
    parseRedOakCanaryCliArguments(["--", "--live", "--gates", "/tmp/red-oak-gates.json"]),
    {
      optIn: true,
      retrievalOnly: false,
      preconditionsPath: "/tmp/red-oak-gates.json",
      outputPath: undefined,
    },
  );
  assert.deepEqual(
    parseRedOakCanaryCliArguments(["--", "--live", "--retrieval-only", "--gates", "/tmp/red-oak-gates.json"]),
    {
      optIn: true,
      retrievalOnly: true,
      preconditionsPath: "/tmp/red-oak-gates.json",
      outputPath: undefined,
    },
  );
});

test("request-local canary collector preserves bounded discovery and receipt metadata without document payloads", () => {
  const collector = createRedOakCanaryDiagnosticCollector();
  const candidate = {
    url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/opaque-token",
    title: "Official Grid Record",
    sourceChannel: "google-grounded-search",
    categoryIds: ["grid"],
    excerpt: "This payload must not be retained.",
  };
  const passage = `The source passage is represented by a bounded excerpt and full hash. ${"x".repeat(2_000)}`;
  collector.recordDiscoveryCandidates([candidate]);
  collector.recordPhysicalOpenAuthorization({
    categoryId: "grid",
    source: { ...candidate, discoveryCandidateRank: 1 },
    canonicalUrl: candidate.url,
    physicalOpenIndex: 1,
  });
  collector.recordPhysicalReceipt({
    phase: "grounded-discovery-prefetch",
    candidateIndex: 1,
    candidate,
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      physicalOpenIndex: 1,
      originalUrl: candidate.url,
      passage,
      extractionOutcome: "extracted",
    },
    attempted: true,
  });
  const captured = collector.toJSON();
  const serialized = JSON.stringify(captured);
  assert.equal(captured.discoveryCandidateCount, 1);
  assert.equal(captured.discoveryCandidates[0].candidateId, "discovery-1");
  const opaquePathHash = createHash("sha256").update("opaque-token").digest("hex").slice(0, 16);
  assert.equal(
    captured.discoveryCandidates[0].url,
    `https://vertexaisearch.cloud.google.com/grounding-api-redirect/redacted-${opaquePathHash}`,
  );
  assert.equal(captured.physicalOpenAuthorizations[0].physicalOpenIndex, 1);
  assert.equal(captured.physicalReceipts[0].physicalOpenIndexes[0], 1);
  assert.equal(captured.physicalReceipts[0].passageLength, passage.length);
  assert.equal(captured.physicalReceipts[0].passageSha256, createHash("sha256").update(passage).digest("hex"));
  assert.equal(captured.physicalReceipts[0].passageExcerpt.length, 1_500);
  assert.equal(serialized.includes(captured.physicalReceipts[0].passageExcerpt), true);
  assert.equal(serialized.includes(passage), false);
  assert.equal(serialized.includes("This payload must not be retained"), false);
  assert.equal(serialized.includes("opaque-token"), false);
  assert.match(captured.captureStatus, /bounded-passage-excerpts-no-full-document-payloads/);

  const completeness = canaryPhysicalReceiptCompleteness({
    canary: { scope: { physicalDocumentOpens: 2 } },
    sourceStates: {
      normalizedCandidates: [{ accessOutcome: { physicalOpenIndex: 2 } }],
    },
  }, captured);
  assert.deepEqual(completeness.missingPhysicalOpenIndexes, [2]);
  assert.deepEqual(completeness.authorizedButReceiptMissingIndexes, []);
  assert.equal(completeness.reconstructionAttempted, false);
  assert.equal(completeness.refetchAttempted, false);
});

test("full acceptance report redacts Google grounding redirect tokens without conflating URLs", () => {
  const rawUrls = [
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/opaque-google-token-one?keep=public&token=secret-one",
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/opaque-google-token-two?keep=public&token=secret-two",
  ];
  const report = buildAcceptanceReport({
    project: { name: "Red Oak Campus", location: "Red Oak, Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: {
          categories: [],
          providerAttempts: [],
          candidateLineage: rawUrls.map((url, index) => ({
            categoryId: "grid",
            url,
            canonicalUrl: url,
            discoveryRank: index + 1,
            accessOutcome: { state: "not-attempted", reason: "candidate-limit" },
          })),
        },
        researchCoverage: {
          discoveryAcceptedCitationUrls: rawUrls,
        },
        sourceLedger: rawUrls.map((url) => ({
          url,
          canonicalUrl: url,
          accessOutcome: { state: "not-attempted", reason: "candidate-limit" },
        })),
        evidence: [],
      },
    },
  });
  const serialized = JSON.stringify(report);
  const projectedUrls = [
    ...report.sourceStates.normalizedCandidates.map((candidate) => candidate.url),
    ...report.candidateLineage.map((candidate) => candidate.url),
    ...report.discovery.acceptedCitationUrls,
  ];

  for (const rawUrl of rawUrls) assert.doesNotMatch(serialized, new RegExp(rawUrl.split("/").at(-1).split("?")[0]));
  assert.equal(new Set(projectedUrls).size, 2);
  assert.ok(projectedUrls.every((url) => /\/grounding-api-redirect\/redacted-[a-f0-9]{16}/.test(url)));
  assert.ok(projectedUrls.every((url) => url.includes("?keep=public")));
  assert.ok(projectedUrls.every((url) => !url.includes("token=")));
});

test("request-local canary audit records ranked selection and unopened candidates without document payloads", () => {
  const collector = createRedOakCanaryDiagnosticCollector();
  const exactProject = {
    url: "https://records.example/project/red-oak?token=url-secret-value",
    title: "Red Oak Campus project filing",
    sourceChannel: "official-record",
    categoryIds: ["grid"],
    acquisitionPriority: 100,
    acquisitionPriorityReasons: ["exact project title", "official project-specific filing"],
  };
  const genericRoot = {
    url: "https://records.example/",
    title: "Records homepage",
    sourceChannel: "official-record",
    categoryIds: ["grid"],
    acquisitionPriority: 5,
    acquisitionPriorityReasons: ["generic authority root"],
    acquisitionSelected: true,
    acquisitionSelectionReason: "ranked-within-candidate-limit",
  };
  const reusedCandidate = {
    url: "https://records.example/shared-source?token=reused-secret",
    title: "Previously retrieved official record",
    acquisitionPriority: 10,
    acquisitionSelected: true,
    selectedForOpen: true,
    acquisitionSelectionReason: "ranked-within-candidate-limit",
  };
  collector.recordDiscoveryCandidates([exactProject, genericRoot, reusedCandidate]);
  collector.recordPhysicalOpenAuthorization({
    categoryId: "grid",
    source: { ...exactProject, discoveryCandidateRank: 1 },
    canonicalUrl: exactProject.url,
    physicalOpenIndex: 1,
  });
  collector.recordPhysicalReceipt({
    phase: "grounded-discovery-prefetch",
    candidateIndex: 1,
    candidate: { ...exactProject, discoveryCandidateRank: 1 },
    accessOutcome: {
      state: "accessible",
      passage: "Red Oak Campus grid filing. Contact https://records.example/private?token=secret-value",
      physicalOpenIndex: 1,
    },
    attempted: true,
  });
  collector.recordPhysicalReceipt({
    phase: "grounded-discovery-prefetch",
    candidateIndex: 2,
    candidate: { ...genericRoot, discoveryCandidateRank: 2 },
    accessOutcome: { state: "not-attempted", reason: "protected-opportunity" },
    attempted: false,
  });
  collector.recordPhysicalReceipt({
    phase: "grounded-discovery-prefetch",
    candidateIndex: 3,
    candidate: { ...reusedCandidate, discoveryCandidateRank: 3 },
    accessOutcome: {
      state: "accessible",
      reason: "canonical-document-receipt-reused",
      reused: true,
      physicalOpenIndex: 1,
    },
    attempted: false,
    reused: true,
  });

  const captured = collector.toJSON();
  assert.equal(captured.discoveryCandidateCount, 3);
  assert.equal(captured.discoveryCandidates.length, 3);
  assert.equal(captured.discoveryCandidates[0].acquisitionPriority, 100);
  assert.equal(captured.discoveryCandidates[0].acquisitionSelected, true);
  assert.deepEqual(captured.discoveryCandidates[0].acquisitionPriorityReasons, [
    "exact project title",
    "official project-specific filing",
  ]);
  assert.deepEqual(captured.discoveryCandidates[0].selectionDecision, {
    decision: "selected",
    selected: true,
    reason: "Physical document open was attempted.",
    physicalOpenPosition: 1,
  });
  assert.equal(captured.discoveryCandidates[0].selectionDecision.physicalOpenPosition, 1);
  assert.match(captured.physicalReceipts[0].passageExcerpt, /Red Oak Campus grid filing/);
  assert.doesNotMatch(captured.physicalReceipts[0].passageExcerpt, /secret-value/);
  assert.equal(captured.discoveryCandidates[1].selectedForOpening, false);
  assert.equal(captured.discoveryCandidates[1].candidateLimitSelected, true);
  assert.equal(captured.discoveryCandidates[1].acquisitionSelected, false);
  assert.equal(captured.discoveryCandidates[1].selectionDecision.decision, "not-selected");
  assert.equal(captured.discoveryCandidates[1].selectionDecision.reason, "protected-opportunity");
  assert.equal(captured.discoveryCandidates[1].physicalOpenPosition, null);
  assert.equal(captured.discoveryCandidates[2].candidateLimitSelected, true);
  assert.equal(captured.discoveryCandidates[2].acquisitionSelected, false);
  assert.equal(captured.discoveryCandidates[2].selectedForOpening, false);
  assert.equal(captured.discoveryCandidates[2].physicalOpenAdmission, "reused-receipt");
  assert.equal(captured.discoveryCandidates[2].selectionDecision.decision, "reused");
  assert.equal(captured.discoveryCandidates[2].selectionDecision.selected, false);
  assert.equal(captured.discoveryCandidates[2].physicalOpenPosition, 1);
  const serialized = JSON.stringify(captured);
  assert.doesNotMatch(serialized, /url-secret-value/);
  assert.doesNotMatch(serialized, /token=/);
});

test("retrieval-only blocker report distinguishes usable and exact-project passages without treating absent analysis as failure", () => {
  const exactHash = createHash("sha256").update("Red Oak Campus is served by the disclosed substation.").digest("hex");
  const contextHash = createHash("sha256").update("Ellis County has several electric utilities.").digest("hex");
  const report = {
    candidateLineage: [
      {
        url: "https://records.example/red-oak/grid",
        acquisitionRank: 80,
        identityResult: { exactProject: true, state: "project-specific" },
        passageResult: {
          state: "retained",
          passageSha256: exactHash,
          excerpt: "Red Oak Campus is served by the disclosed substation.",
        },
        usablePassage: true,
        passageExcerpt: "Red Oak Campus is served by the disclosed substation.",
      },
      {
        url: "https://records.example/ellis-county/utility",
        acquisitionRank: 1,
        identityResult: { exactProject: false, state: "unresolved" },
        passageResult: {
          state: "retained",
          passageSha256: contextHash,
          excerpt: "Ellis County has several electric utilities.",
        },
        usablePassage: true,
        passageExcerpt: "Ellis County has several electric utilities.",
      },
    ],
  };

  const passageAudit = canaryRetrievalPassageAudit(report);
  const blockers = canaryRemainingBlockers(
    report,
    { structuredProviderCalls: 0 },
    [],
    true,
  );
  assert.equal(passageAudit.usablePassageCount, 2);
  assert.equal(passageAudit.exactProjectPassageCount, 1);
  assert.equal(passageAudit.exactProjectPassages[0].passageSha256, exactHash);
  assert.equal(passageAudit.exactProjectPassages[0].excerpt, "Red Oak Campus is served by the disclosed substation.");
  assert.equal(blockers.analysisAbsenceClassification, "intentional-retrieval-only-stop-not-retrieval-failure");
  assert.equal(blockers.missingStructuredAnalysisPacketIsRetrievalFailure, false);
  assert.deepEqual(blockers.unresolvedCategories, []);
  assert.equal(blockers.noUsableGroundedPassageAvailableForAnalysis, null);
  assert.equal(blockers.passageIdentityAudit.usablePassageCount, 2);
  assert.equal(blockers.passageIdentityAudit.exactProjectPassageCount, 1);
});

test("canary cache and registry resources always use distinct temporary directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "safeloc-red-oak-isolation-test-"));
  try {
    const first = createRedOakCanaryResources(path.join(root, "first"));
    const second = createRedOakCanaryResources(path.join(root, "second"));
    assert.notEqual(first.cache, second.cache);
    assert.notEqual(first.registry.directory, second.registry.directory);
    assert.equal(first.registry.directory, path.join(root, "first", "registry"));
    assert.equal(second.registry.directory, path.join(root, "second", "registry"));
    assert.equal(first.storageMode, "isolated-temporary-cache-and-registry");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports bounded citation acceptance and rejection states distinctly", () => {
  const report = buildAcceptanceReport({
    project: { name: "Diagnostic Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchOutcome: { state: "complete-no-eligible-evidence", eligibleEvidenceCount: 0, reasonCodes: [] },
        researchAudit: {
          categories: [],
          providerAttempts: [{
            provider: "google-gemini-grounding",
            model: "offline-fixture",
            providerResponseId: "interaction_fixture_123",
            providerResponseIdAvailability: "provider-reported",
            usageAvailability: "provider-reported",
            usage: { inputTokens: 120, outputTokens: 34, totalTokens: 154 },
          }],
          elapsedMs: 1,
        },
        researchCoverage: {
          discoveryStatus: "completed",
          discoveryState: "usable-citations",
          discoveryRawAnnotationSummaries: [
            { type: "url_citation", url: "https://records.example/a", canonicalUrl: "https://records.example/a", accepted: true },
            { type: "url_citation", url: "file:///unsafe", accepted: false, rejectionReason: "unsafe-or-invalid-url" },
          ],
          discoveryAcceptedCitationUrls: ["https://records.example/a"],
          discoveryRejectedCitationUrls: [{ url: "file:///unsafe", reason: "unsafe-or-invalid-url" }],
        },
        sourceLedger: [],
        evidence: [],
      },
    },
  });
  assert.equal(report.discovery.status, "completed");
  assert.equal(report.discovery.state, "usable-citations");
  assert.equal(report.discovery.rawAnnotationSummaries[0].accepted, true);
  assert.equal(report.discovery.rawAnnotationSummaries[1].rejectionReason, "unsafe-or-invalid-url");
  assert.deepEqual(report.discovery.acceptedCitationUrls, ["https://records.example/a"]);
  assert.equal(report.discovery.rejectedCitationUrls[0].reason, "unsafe-or-invalid-url");
  assert.equal(report.run.providerAttempts[0].providerResponseId, "interaction_fixture_123");
  assert.equal(report.run.providerAttempts[0].providerResponseIdAvailability, "provider-reported");
  assert.equal(report.run.providerAttempts[0].usageAvailability, "provider-reported");
  assert.deepEqual(report.run.providerAttempts[0].usage, {
    inputTokens: 120,
    outputTokens: 34,
    totalTokens: 154,
  });
});

test("diagnostic report preserves duplicate annotation summaries from research audit fallback and marks absent telemetry unavailable", () => {
  const duplicateUrl = "https://records.example/grid-filing";
  const rawAnnotationSummaries = [
    {
      discoveryRank: 1,
      type: "url_citation",
      title: "Grid filing",
      url: duplicateUrl,
      canonicalUrl: duplicateUrl,
      accepted: true,
      rejectionReason: null,
    },
    {
      discoveryRank: 2,
      type: "url_citation",
      title: "Duplicate grid filing",
      url: duplicateUrl,
      canonicalUrl: duplicateUrl,
      accepted: false,
      rejectionReason: "duplicate-canonical-url",
    },
  ];
  const report = buildAcceptanceReport({
    project: { name: "Red Oak Campus", location: "Red Oak, Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: {
          categories: [],
          providerAttempts: [],
          discovery: {
            provider: "google-gemini-grounding",
            model: "gemini-3.8-flash",
            status: "completed",
            candidateCount: 1,
            annotationCount: 2,
            rawAnnotationSummaries,
            acceptedCitationUrls: [duplicateUrl],
            rejectedCitationUrls: [
              { discoveryRank: 2, url: duplicateUrl, reason: "duplicate-canonical-url" },
            ],
          },
        },
        researchCoverage: {
          discoveryStatus: "completed",
          discoveryRawAnnotationSummaries: [],
          discoveryAcceptedCitationUrls: [],
          discoveryRejectedCitationUrls: [],
        },
        sourceLedger: [],
        evidence: [],
      },
    },
  });
  assert.equal(report.discovery.rawAnnotationSummariesAvailability, "reported");
  assert.equal(report.discovery.rawAnnotationSummariesSource, "researchAudit.discovery");
  assert.equal(report.discovery.annotationCount, 2);
  assert.deepEqual(report.discovery.rawAnnotationSummaries, [
    {
      discoveryRank: 1,
      type: "url_citation",
      title: "Grid filing",
      url: duplicateUrl,
      canonicalUrl: duplicateUrl,
      accepted: true,
      rejectionReason: null,
    },
    {
      discoveryRank: 2,
      type: "url_citation",
      title: "Duplicate grid filing",
      url: duplicateUrl,
      canonicalUrl: duplicateUrl,
      accepted: false,
      rejectionReason: "duplicate-canonical-url",
    },
  ]);
  assert.deepEqual(report.discovery.acceptedCitationUrls, [duplicateUrl]);
  assert.deepEqual(report.discovery.rejectedCitationUrls, [
    { discoveryRank: 2, url: duplicateUrl, reason: "duplicate-canonical-url" },
  ]);
  assert.deepEqual(report.run.discovery.rawAnnotationSummaries, report.discovery.rawAnnotationSummaries);

  const unavailable = buildAcceptanceReport({
    project: { name: "Red Oak Campus", location: "Red Oak, Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: { categories: [], providerAttempts: [] },
        researchCoverage: { discoveryStatus: "completed" },
        sourceLedger: [],
        evidence: [],
      },
    },
  });
  assert.equal(unavailable.discovery.rawAnnotationSummariesAvailability, "unavailable-not-retained-in-report");
  assert.deepEqual(unavailable.discovery.rawAnnotationSummaries, []);
});

test("canary quality and supplied-to-Grid reporting consume actual report and packet fields", () => {
  const suppliedPassage = "Project Atlas planning filing describes an interconnection milestone.";
  const notSuppliedPassage = "Project Atlas planning filing discusses another topic.";
  const suppliedUrl = "https://records.example/grid-document?token=do-not-report";
  const notSuppliedUrl = "https://records.example/other-document";
  const report = buildAcceptanceReport({
    project: { name: "Project Atlas", location: "Phoenix, Arizona" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchOutcome: { state: "complete-no-eligible-evidence", eligibleEvidenceCount: 0, reasonCodes: [] },
        researchAudit: {
          categories: [],
          providerAttempts: [],
          candidateLineage: [
            {
              categoryId: "grid",
              url: suppliedUrl,
              canonicalUrl: suppliedUrl,
              discoveryRank: 3,
              acquisitionRank: 1,
              acquisitionPriority: 90,
              acquisitionReasons: ["exact project name"],
              acquisitionSelected: true,
              acquisitionSelectionReason: "ranked-within-candidate-limit",
              physicalOpenAdmission: "authorized",
              accessOutcome: { state: "blocked", reason: "document-blocked", physicalOpenIndex: 1 },
              identityResult: { exactProject: true, state: "project-specific" },
              passageResult: {
                state: "retained",
                passageSha256: createHash("sha256").update(suppliedPassage).digest("hex"),
              },
            },
            {
              categoryId: "grid",
              url: notSuppliedUrl,
              canonicalUrl: notSuppliedUrl,
              discoveryRank: 1,
              acquisitionRank: 2,
              acquisitionPriority: 5,
              acquisitionReasons: ["generic root"],
              acquisitionSelected: false,
              acquisitionSelectionReason: "candidate-limit",
              physicalOpenAdmission: "not-selected",
              accessOutcome: { state: "not-attempted", reason: "candidate-limit" },
              identityResult: { exactProject: false, state: "unresolved" },
              passageResult: {
                state: "retained",
                passageSha256: createHash("sha256").update(notSuppliedPassage).digest("hex"),
              },
            },
            {
              categoryId: "grid",
              url: "https://records.example/deferred",
              discoveryRank: 2,
              acquisitionRank: 3,
              acquisitionPriority: 7,
              acquisitionReasons: ["official-source-type"],
              acquisitionSelected: true,
              acquisitionSelectionReason: "ranked-within-candidate-limit",
              physicalOpenAdmission: "deferred",
              accessOutcome: { state: "not-attempted", reason: "physical-open-budget" },
              identityResult: { exactProject: false, state: "unresolved" },
              passageResult: { state: "not-retained", reason: "physical-open-budget" },
            },
            {
              categoryId: "grid",
              url: "https://records.example/reused",
              discoveryRank: 4,
              acquisitionRank: 4,
              acquisitionSelected: true,
              selectedForOpen: true,
              acquisitionSelectionReason: "ranked-within-candidate-limit",
              physicalOpenAdmission: "reused-receipt",
              accessOutcome: {
                state: "accessible",
                reason: "canonical-document-receipt-reused",
                reused: true,
                physicalOpenIndex: 1,
              },
              identityResult: { exactProject: false, state: "unresolved" },
              passageResult: { state: "retained", passageSha256: createHash("sha256").update("reused passage").digest("hex") },
            },
          ],
        },
        sourceLedger: [
          {
            url: suppliedUrl,
            canonicalUrl: suppliedUrl,
            accessOutcome: {
              state: "accessible",
              reason: "retrieved",
              passage: suppliedPassage,
              extractionOutcome: "substantive-content",
            },
          },
          {
            url: "https://records.example/error-page",
            accessOutcome: {
              state: "blocked-or-shell",
              reason: "application-error-page",
              extractionOutcome: "application-error-page",
            },
          },
          {
            url: "https://records.example/corrupted-document",
            accessOutcome: {
              state: "rejected",
              reason: "control-heavy-content",
              extractionOutcome: "control-heavy-content",
            },
          },
          {
            url: notSuppliedUrl,
            canonicalUrl: notSuppliedUrl,
            accessOutcome: {
              state: "accessible",
              reason: "retrieved",
              passage: notSuppliedPassage,
              extractionOutcome: "substantive-content",
            },
          },
        ],
        evidence: [],
      },
    },
  });
  const trace = createRedOakClaimTrace();
  const packet = [{
    sourceId: "document-1",
    canonicalUrl: "https://records.example/grid-document?token=packet-secret",
    sourceUrl: "https://records.example/grid-document?token=packet-secret",
    title: "Grid planning filing",
    passage: suppliedPassage,
  }];
  trace.recordAnalysisPacket({
    categoryId: "grid",
    attemptType: "primary",
    packet,
  });

  const packets = markGridSuppliedCandidates(report, trace.toJSON());
  const candidates = report.sourceStates.normalizedCandidates;
  assert.equal(report.sources, undefined);
  assert.equal(candidates[0].suppliedToGrid, true);
  assert.equal(candidates[0].passageSha256, createHash("sha256").update(suppliedPassage).digest("hex"));
  assert.equal(candidates.find((candidate) => candidate.accessReason === "application-error-page").suppliedToGrid, false);
  assert.equal(candidates.find((candidate) => candidate.accessReason === "control-heavy-content").suppliedToGrid, false);
  assert.equal(candidates.find((candidate) => candidate.url === notSuppliedUrl).suppliedToGrid, false);
  assert.equal(report.candidateLineage[0].suppliedToGrid, true);
  assert.equal(report.candidateLineage[1].suppliedToGrid, false);
  assert.equal(report.candidateLineage[0].acquisitionPriority, 90);
  assert.deepEqual(report.candidateLineage[0].acquisitionPriorityReasons, ["exact project name"]);
  assert.equal(report.candidateLineage[0].selectionDecision.physicalOpenPosition, 1);
  assert.equal(report.candidateLineage[0].discoveryRank, 3);
  assert.equal(report.candidateLineage[0].acquisitionRank, 1);
  assert.equal(report.candidateLineage[0].usablePassage, true);
  assert.equal(report.candidateLineage[0].exactProjectPassage, true);
  assert.equal(report.candidateLineage[0].passageExcerpt, suppliedPassage);
  assert.equal(report.candidateLineage[1].exactProjectPassage, false);
  assert.equal(report.candidateLineage[2].candidateLimitSelected, true);
  assert.equal(report.candidateLineage[2].acquisitionSelected, false);
  assert.equal(report.candidateLineage[2].selectedForOpening, false);
  assert.equal(report.candidateLineage[2].selectionDecision.decision, "deferred");
  assert.equal(report.candidateLineage[3].candidateLimitSelected, true);
  assert.equal(report.candidateLineage[3].acquisitionSelected, false);
  assert.equal(report.candidateLineage[3].selectedForOpening, false);
  assert.equal(report.candidateLineage[3].physicalOpenAdmission, "reused-receipt");
  assert.equal(report.candidateLineage[3].selectionDecision.decision, "reused");
  assert.equal(report.candidateLineage[1].selectionDecision.decision, "not-selected");
  assert.equal(report.candidateLineage[1].selectedForOpening, false);
  assert.equal(packets[0].passages[0].quoteSha256, createHash("sha256").update(suppliedPassage).digest("hex"));
  assert.ok(packets[0].packetSha256);
  assert.equal(packets[0].passageCount, packet.length);
  assert.ok(!JSON.stringify(packets).includes("packet-secret"));

  const observations = canaryContentQualityObservations(report);
  assert.equal(canaryCandidateCount(report), 4);
  assert.equal(observations.applicationErrorFilter.observedCandidateCount, 1);
  assert.equal(observations.applicationErrorFilter.observedLive, true);
  assert.equal(observations.corruptedTextFilter.observedCandidateCount, 1);
  assert.equal(observations.corruptedTextFilter.observedLive, true);
});

test("builds a diagnostic-only report with bounded live-run and retention fields", () => {
  const report = buildAcceptanceReport({
    project: { name: "Live Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchOutcome: {
          state: "incomplete-technical-limitation",
          eligibleEvidenceCount: 0,
          reasonCodes: ["document-access-failure"],
        },
        researchAudit: {
          runCorrelationId: "run-live-atlas",
          provider: "openai",
          model: "gpt-4o",
          providerResponseIds: ["resp_live"],
          startedAt: "2026-09-08T10:00:00.000Z",
          finishedAt: "2026-09-08T10:00:04.000Z",
          elapsedMs: 4_000,
          providerRequestCount: 9,
          providerAttempts: [{
            categoryId: "grid",
            attemptType: "primary",
            requestBodyBytes: 26_071,
            requestedOutputTokens: 3_500,
            usage: { inputTokens: 5_383, outputTokens: 412, totalTokens: 5_795 },
          }],
          toolCallCount: 16,
          budget: { ...RESEARCH_RUN_BUDGET },
          categoryGaps: ["water"],
          providerLimitations: ["Some filings were not accessible."],
          categories: [
            {
              categoryId: "grid",
              label: "Grid",
              requestedPrimaryQuery: "grid query",
              executedQueries: ["observed grid query"],
              followUpExecutedQuery: null,
              state: "Complete",
              stageCounts: { retainedCandidates: 2 },
              unresolvedGaps: [],
              accessLimitations: [],
            },
            {
              categoryId: "water",
              label: "Water",
              requestedPrimaryQuery: "water query",
              executedQueries: ["observed water query"],
              followUpExecutedQuery: "observed water follow-up",
              state: "Partial",
              stageCounts: { retainedCandidates: 1 },
              unresolvedGaps: ["water_rights"],
              accessLimitations: ["Bounded document access stopped at the size limit."],
            },
          ],
        },
        sourceLedger: [
          {
            url: "https://example.gov/grid",
            title: "Grid filing",
            searchDomain: "grid",
            sourceState: "claim-supported",
            accessOutcome: {
              state: "accessible",
              passage: "The filing identifies Live Atlas and its grid interconnection.",
              transportDiagnostic: {
                stage: "complete",
                sourceOrigin: "https://example.gov",
                sourcePathname: "/grid",
                elapsedMs: 120,
                responseReceived: true,
                httpStatus: 200,
                contentType: "text/html",
              },
            },
            claimSupportState: "supported",
            projectSpecificityState: "project-specific",
            financialEligibilityState: "eligible",
          },
        ],
      },
    },
    failureRun: {
      statusCode: 200,
      payload: {
        evidence: [{ id: "retained" }],
        researchAudit: {
          physicalOpenBudget: 24,
          physicalOpensUsed: 24,
          physicalOpensRemaining: 0,
          physicalOpenBudgetExceeded: true,
          categories: [{
            categoryId: "water",
            label: "Water",
            state: "Not searched",
            followUpSkipReason: "physical-open-budget",
            accessLimitations: ["The physical document-open ceiling was reached."],
            unresolvedGaps: ["water_rights"],
            stageCounts: { notAttempted: 3 },
          }],
        },
        researchCache: {
          state: "stale",
          refreshStatus: "failed",
          providerAvailable: false,
          errorType: "upstream",
        },
      },
    },
    generatedAt: "2026-09-08T10:00:00.000Z",
  });

  assert.equal(report.diagnosticOnly, true);
  assert.equal(report.evidenceStatus, "not-evidence");
  assert.equal(report.run.provider, "openai");
  assert.equal(report.run.status, "incomplete-technical-limitation");
  assert.equal(report.run.runId, "run-live-atlas");
  assert.equal(report.run.model, "gpt-4o");
  assert.equal(report.run.elapsedWithinDeadline, true);
  assert.equal(report.run.limitsObserved.providerRequestsWithinLimit, true);
  assert.equal(report.run.limitsObserved.followUpsWithinLimit, true);
  assert.equal(report.run.providerAttempts[0].usage.totalTokens, 5_795);
  assert.deepEqual(report.executedQueries[1].executedQueries, ["observed water query"]);
  assert.deepEqual(report.categoryGaps, ["water"]);
  assert.equal(report.sourceStates.bySourceState["claim-supported"], 1);
  assert.equal(report.sourceStates.byAccessOutcome.accessible, 1);
  assert.equal(report.sourceStates.retainedPassages.length, 1);
  assert.equal(report.sourceStates.sources[0].transportDiagnostic.httpStatus, 200);
  assert.deepEqual(report.providerLimitations, [
    "Some filings were not accessible.",
    "Bounded document access stopped at the size limit.",
  ]);
  assert.equal(report.failureRetention.cacheState, "stale");
  assert.equal(report.failureRetention.refreshStatus, "failed");
  assert.equal(report.failureRetention.retainedResult, true);
  assert.equal(report.failureRetention.retainedBudgetDiagnostics.telemetryStatus, "historical-retained");
  assert.equal(report.failureRetention.retainedBudgetDiagnostics.physicalOpensUsed, 24);
  assert.equal(report.failureRetention.retainedBudgetDiagnostics.physicalOpensRemaining, 0);
  assert.equal(report.failureRetention.retainedBudgetDiagnostics.physicalOpenBudgetExceeded, true);
  assert.equal(report.failureRetention.retainedBudgetDiagnostics.categories[0].followUpSkipReason, "physical-open-budget");
  assert.equal(report.failureRetention.labeledStaleOrPartial, true);
  assert.equal("evidence" in report, false);
});

test("emits a bounded sanitized project, request, receipt, evidence, and handoff audit", () => {
  const longPassage = "exact project passage ".repeat(300);
  const report = buildAcceptanceReport({
    project: {
      name: "Directory Atlas",
      location: "Maricopa County, Arizona",
      knownData: {
        providerId: "directory-atlas-az",
        aliases: ["Directory Atlas", "Atlas Campus"],
        operator: "Atlas Operator",
        status: "planned",
        city: "Tonopah",
        county: "Maricopa County",
        state: "Arizona",
        authorityNames: ["Maricopa County", "Arizona Corporation Commission"],
        authorityDomains: ["maricopa.gov"],
        sourceUrl: "https://directory.example/atlas",
      },
    },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: {
          runCorrelationId: "run-directory-atlas",
          startedAt: "2026-09-08T10:00:00.000Z",
          finishedAt: "2026-09-08T10:00:04.000Z",
          elapsedMs: 4_000,
          providerRequestCount: 2,
          providerAttempts: [{
            categoryId: "grid",
            attemptType: "primary",
            requestBodyBytes: 900,
            requestedOutputTokens: 3_500,
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          }],
          toolCallCount: 2,
          budget: { ...RESEARCH_RUN_BUDGET },
          searchedDomains: ["azcc.gov"],
          categories: [
            {
              categoryId: "water",
              label: "Water",
              executedQueries: ["water observed"],
              unresolvedGaps: ["water_rights"],
              state: "Partial",
              stageCounts: { retainedCandidates: 1, notAttempted: 2 },
            },
            {
              categoryId: "grid",
              label: "Grid",
              executedQueries: ["grid observed"],
              unresolvedGaps: [],
              state: "Complete",
              evidenceIds: ["grid_interconnection"],
              stageCounts: { retainedCandidates: 1 },
            },
          ],
          categoryGaps: ["water_rights"],
        },
        sourceLedger: [{
          url: "https://azcc.gov/records/atlas",
          originalUrl: "https://azcc.gov/records/atlas?ref=provider",
          canonicalUrl: "https://azcc.gov/records/atlas",
          title: "Atlas decision",
          searchDomain: "grid",
          sourceState: "claim-supported",
          sourceRole: "primary-government",
          identityRole: "project identity",
          exactProject: true,
          documentReferringUrls: ["https://provider.example/result"],
          documentAccessReused: true,
          claimSupportState: "supported",
          projectSpecificityState: "project-specific",
          financialEligibilityState: "eligible",
          accessOutcome: {
            state: "accessible",
            reason: "retrieved",
            physicalOpenIndex: 1,
            passage: longPassage,
            transportDiagnostic: { stage: "complete", httpStatus: 200, responseReceived: true },
          },
        }],
        evidence: [{
          id: "grid_interconnection",
          label: "Grid interconnection",
          rawValue: "12 months",
          value: 12,
          normalizedValue: 12,
          unit: "months",
          normalizedUnit: "months",
          classification: "Verified Evidence",
          claimTimePeriod: "2026",
          eligibleForModel: true,
          acceptedForModel: false,
          claimMappings: [{
            sourceId: "https://azcc.gov/records/atlas",
            passageId: "passage-1",
            supportStatus: "supported",
            exactQuotation: longPassage,
            rejectionCodes: [],
          }],
          quarantineReasons: [],
          sourceValidation: { state: "financially-eligible" },
        }],
        proposedInputs: [{ id: "grid_interconnection" }],
        acceptedModelInputs: [],
      },
    },
    failureRun: null,
  });

  assert.deepEqual(report.project, {
    name: "Directory Atlas",
    location: "Maricopa County, Arizona",
    directoryProvider: "Compute Atlas",
    directoryProviderId: "directory-atlas-az",
    aliases: ["Directory Atlas", "Atlas Campus"],
    operator: "Atlas Operator",
    status: "planned",
    city: "Tonopah",
    county: "Maricopa County",
    state: "Arizona",
    sourceUrl: "https://directory.example/atlas",
    authorities: {
      establishedDomains: ["maricopa.gov", "azcc.gov"],
      identifiedAuthorities: ["Maricopa County", "Arizona Corporation Commission"],
      missingAuthorityDomains: [],
      companyDomains: [],
    },
  });
  assert.deepEqual(report.observedSearches, [
    { categoryId: "water", query: "water observed" },
    { categoryId: "grid", query: "grid observed" },
  ]);
  assert.equal(report.requests[0].usage.totalTokens, 30);
  assert.equal(report.returnedDomains[0], "azcc.gov");
  assert.equal(report.sourceStates.normalizedCandidates[0].accessOutcome.reused, true);
  assert.equal(report.sourceStates.normalizedCandidates[0].identityRole, "project identity");
  assert.equal(report.sourceStates.retainedPassages[0].truncated, true);
  assert.equal(report.sourceStates.retainedPassages[0].text.length, 1_500);
  assert.equal(report.evidenceAudit[0].rawValue, "12 months");
  assert.equal(report.evidenceAudit[0].normalizedUnit, "months");
  assert.equal(report.evidenceAudit[0].mappings[0].supportStatus, "supported");
  assert.equal(report.evidenceAudit[0].eligibilityDecision.eligibleForModel, true);
  assert.deepEqual(report.budgetState.documentsNotAttempted, [{ categoryId: "water", count: 2, reason: null }]);
  assert.equal(report.workbenchState.reviewAction, "Review findings");
  assert.equal(report.sessionState.runId, "run-directory-atlas");
  assert.equal("rawPayload" in report, false);
  assert.equal("evidence" in report, false);
});

test("attributes sparse category-scoped acceptance telemetry by category ID", () => {
  const report = buildAcceptanceReport({
    project: { name: "Scoped Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: {
          categories: [
            { categoryId: "water", label: "Water", executedQueries: ["water query"], state: "Partial" },
            { categoryId: "grid", label: "Grid", executedQueries: ["grid query"], state: "Complete" },
          ],
          categoryGaps: ["water"],
        },
        evidence: [],
      },
    },
    failureRun: null,
  });

  assert.deepEqual(report.executedQueries.map((category) => [category.categoryId, category.executedQueries]), [
    ["water", ["water query"]],
    ["grid", ["grid query"]],
  ]);
  assert.equal(report.categories.find((category) => category.categoryId === "water").state, "Partial");
  assert.equal(report.categories.find((category) => category.categoryId === "grid").state, "Complete");
});

test("reports complete no eligible evidence when discovery finishes without a governed finding", () => {
  const report = buildAcceptanceReport({
    project: { name: "Blocked Atlas", location: "Maricopa County, Arizona" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchStatus: "completed",
        researchOutcome: {
          state: "complete-no-eligible-evidence",
          eligibleEvidenceCount: 0,
          reasonCodes: [],
        },
        researchAudit: {
          runCorrelationId: "run-blocked-atlas",
          categories: [],
          categoryGaps: ["grid"],
          budget: { ...RESEARCH_RUN_BUDGET },
        },
        sourceLedger: [{
          canonicalUrl: "https://example.gov/atlas",
          accessOutcome: { state: "accessible", passage: "A retained passage." },
          exactProject: false,
        }],
        evidence: [],
      },
    },
    failureRun: null,
  });
  assert.equal(report.liveAcceptance.status, "Research complete — no eligible evidence found");
  assert.deepEqual(report.liveAcceptance.trace, []);
  assert.match(report.liveAcceptance.reason, /governed eligibility/i);
});

test("traces the supported source mapping instead of the first attached source", () => {
  const supportedUrl = "https://example.gov/atlas/supported";
  const report = buildAcceptanceReport({
    project: { name: "Mapped Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchOutcome: {
          state: "complete-with-eligible-evidence",
          eligibleEvidenceCount: 1,
          reasonCodes: [],
        },
        evidence: [{
          id: "electricity_cost",
          value: 48,
          eligibleForModel: true,
          claimMappings: [
            { sourceId: supportedUrl, supportStatus: "supported" },
          ],
          sources: [
            {
              url: "https://example.gov/atlas/unmapped",
              canonicalUrl: "https://example.gov/atlas/unmapped",
              title: "Unmapped exact-project record",
              exactProject: true,
              excerpt: "This passage is not mapped to the displayed claim.",
              accessOutcome: { state: "accessible" },
            },
            {
              url: supportedUrl,
              canonicalUrl: supportedUrl,
              title: "Supported exact-project record",
              exactProject: true,
              excerpt: "The facility electricity cost is 48 USD/MWh.",
              accessOutcome: { state: "accessible" },
            },
          ],
        }],
      },
    },
    failureRun: null,
  });
  assert.equal(report.liveAcceptance.status, "Research complete — eligible evidence found");
  assert.equal(report.liveAcceptance.trace[0].sourceUrl, supportedUrl);
  assert.equal(report.liveAcceptance.trace[0].sourceTitle, "Supported exact-project record");
});

test("records the complete Arizona eligible-evidence trace across URL aliases", () => {
  const originalUrl = "https://azcc.gov/records/project-atlas";
  const finalUrl = "https://azcc.gov/records/project-atlas/decision";
  const passage = "The Arizona Corporation Commission decision identifies Project Atlas and approves 48 MW for the 2026 phase.";
  const report = buildAcceptanceReport({
    project: { name: "Project Atlas", location: "Phoenix, Maricopa County, Arizona" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: {
          categories: [{
            categoryId: "grid",
            label: "Grid",
            evidenceIds: ["grid_interconnection"],
            executedQueries: ["observed Project Atlas Arizona interconnection query"],
          }],
        },
        evidence: [{
          id: "grid_interconnection",
          label: "Grid interconnection",
          value: "48 MW",
          unit: "MW",
          classification: "Verified Evidence",
          description: "The decision establishes the project-specific grid arrangement.",
          citation: `Arizona Corporation Commission decision: ${originalUrl}`,
          eligibleForModel: true,
          acceptedForModel: false,
          researchState: "proposed",
          searchTerms: ["observed Project Atlas Arizona interconnection query"],
          sources: [{
            url: finalUrl,
            originalUrl,
            resolvedUrl: finalUrl,
            canonicalUrl: finalUrl,
            title: "Project Atlas Arizona Corporation Commission decision",
            searchDomain: "grid",
            sourceState: "claim-supported",
            exactProject: true,
            financialEligibilityState: "eligible",
            excerpt: passage,
            accessOutcome: {
              state: "accessible",
              reason: "retrieved",
              originalUrl,
              resolvedUrl: finalUrl,
              canonicalUrl: finalUrl,
              passage,
              physicalOpenIndex: 3,
              retrievalTime: "2026-09-17T12:00:00.000Z",
              transportDiagnostic: {
                stage: "complete",
                httpStatus: 200,
                responseReceived: true,
              },
            },
          }],
          claimMappings: [{
            sourceId: originalUrl,
            supportStatus: "supported",
            exactQuotation: passage,
            entityScope: "project",
            timePeriod: "2026",
          }],
          sourceValidation: {
            state: "financially-eligible",
            rejectionCodes: [],
          },
          quarantineReasons: [],
        }],
      },
    },
    failureRun: null,
  });

  const [trace] = report.liveAcceptance.trace;
  assert.equal(report.liveAcceptance.status, "Research complete — eligible evidence found");
  assert.deepEqual(trace.observedQueries, ["observed Project Atlas Arizona interconnection query"]);
  assert.equal(trace.candidate.originalUrl, originalUrl);
  assert.equal(trace.physicalAccessReceipt.state, "accessible");
  assert.equal(trace.physicalAccessReceipt.physicalOpenIndex, 3);
  assert.equal(trace.retainedExactProjectPassage.text, passage);
  assert.equal(trace.governedEvidenceMapping.sourceId, originalUrl);
  assert.equal(trace.governedEvidenceMapping.supportStatus, "supported");
  assert.equal(trace.eligibilityDecision.eligibleForModel, true);
  assert.equal(trace.visibleHandoffFinding.finding, "48 MW");
});

test("keeps provider failures diagnostic and explicit when no category audit is returned", () => {
  const report = buildAcceptanceReport({
    project: { name: "Timed Atlas", location: "Texas" },
    liveRun: {
      statusCode: 504,
      durationMs: 90_001,
      payload: {
        error: "Project research upstream request timed out after 90 seconds.",
        errorType: "timeout",
      },
    },
    failureRun: null,
    generatedAt: "2026-09-08T10:00:00.000Z",
  });

  assert.equal(report.run.status, "incomplete-technical-limitation");
  assert.equal(report.run.provider, "openai");
  assert.equal(report.run.model, "gpt-4o");
  assert.equal(report.run.elapsedMs, 90_001);
  assert.equal(report.run.wallClockElapsedMs, 90_001);
  assert.equal(report.run.elapsedWithinDeadline, false);
  assert.equal(report.run.failureType, "timeout");
  assert.equal(report.executedQueries.every((category) => category.executedQueries.length === 0), true);
  assert.equal(report.categoryGaps.length, RESEARCH_CATEGORIES.length);
  assert.match(report.providerLimitations[0], /timeout/i);
  assert.equal(report.failureRetention.status, "not-run");
  assert.equal("evidence" in report, false);
});

test("includes only the bounded sanitized upstream diagnostic in acceptance output", () => {
  const report = buildAcceptanceReport({
    project: { name: "Limited Atlas", location: "Ohio" },
    liveRun: {
      statusCode: 429,
      durationMs: 120,
      payload: {
        error: "Project research provider is temporarily rate-limited; retry after the indicated delay.",
        errorType: "provider-rate-limit",
        providerDiagnostic: {
          upstreamStatus: 429,
          errorCode: "rate_limit_exceeded",
          errorType: "rate_limit_error",
          message: "Please retry later.",
          requestId: "req_limited",
          rateLimit: { retryAfter: "8", remainingRequests: "0" },
        },
      },
    },
    failureRun: null,
  });

  assert.equal(report.run.failureType, "provider-rate-limit");
  assert.deepEqual(report.run.providerDiagnostic, {
    upstreamStatus: 429,
    errorCode: "rate_limit_exceeded",
    errorType: "rate_limit_error",
    message: "Please retry later.",
    requestId: "req_limited",
    rateLimit: { retryAfter: "8", remainingRequests: "0" },
  });
});

test("retains selected rate-limit, request-state, in-flight, and DNS-rule telemetry only", () => {
  const report = buildAcceptanceReport({
    project: { name: "Synthetic Atlas", location: "Ohio" },
    liveRun: {
      statusCode: 429,
      payload: {
        errorType: "provider-rate-limit",
        providerDiagnostic: {
          upstreamStatus: 429,
          errorCode: "rate_limit_error",
          errorType: "rate_limit_error",
          message: "Retry after a short delay.",
          requestId: "req_synthetic",
          rateLimit: {
            retryAfter: "12",
            remainingRequests: "0",
            resetRequests: "12s",
            remainingTokens: "0",
            resetTokens: "12s",
            authorization: "must not be retained",
          },
        },
        providerAttempts: [
          {
            status: 429,
            requestState: "failed",
            outcome: "failed",
            failureClassification: "provider-rate-limit",
            inFlightAnalysisCount: 1,
            inFlightAnalysisCountAtIssue: 2,
            providerDiagnostic: {
              upstreamStatus: 429,
              errorCode: "rate_limit_error",
              rateLimit: { retryAfter: "12", remainingRequests: "0", resetRequests: "12s" },
            },
          },
          {
            requestState: "cancelled-before-issue",
            outcome: "cancelled-before-issue",
            status: null,
            inFlightAnalysisCount: 1,
          },
        ],
        inFlightAnalysisCount: 1,
      },
    },
    failureRun: null,
  });
  assert.equal(report.run.providerDiagnostic.upstreamStatus, 429);
  assert.deepEqual(report.run.providerDiagnostic.rateLimit, {
    retryAfter: "12",
    remainingRequests: "0",
    resetRequests: "12s",
    remainingTokens: "0",
    resetTokens: "12s",
  });
  assert.equal(report.run.providerAttempts[0].failureClassification, "provider-rate-limit");
  assert.equal(report.run.providerAttempts[0].inFlightAnalysisCountAtIssue, 2);
  assert.equal(report.run.providerAttempts[1].outcome, "cancelled-before-issue");
  assert.equal(report.run.inFlightAnalysisCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /authorization|must not be retained/);

  const dnsReport = buildAcceptanceReport({
    project: { name: "Synthetic Atlas", location: "Ohio" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchAudit: { categories: [] },
        sourceLedger: [{
          url: "https://portal.synthetic.example.test/project",
          accessOutcome: {
            state: "blocked",
            reason: "prohibited-address-class",
            transportDiagnostic: {
              stage: "dns-validation",
              responseReceived: false,
              addressValidationReason: "prohibited-address-class",
              addressValidationCategory: "dns-answer-policy",
              addressValidationRule: "ipv4-private-use",
              addressValidationTelemetry: {
                answerCount: 2,
                addressFamilies: [4],
                addressFamilyCounts: { ipv4: 2, ipv6: 0, other: 0 },
                publicAnswerCount: 1,
                prohibitedAnswerCount: 1,
                rejectingRules: ["ipv4-private-use"],
                addresses: ["10.0.0.8"],
              },
            },
          },
        }],
        evidence: [],
      },
    },
    failureRun: null,
  });
  const transport = dnsReport.sourceStates.normalizedCandidates[0].accessOutcome.transportDiagnostic;
  assert.equal(transport.addressValidationCategory, "dns-answer-policy");
  assert.equal(transport.addressValidationRule, "ipv4-private-use");
  assert.deepEqual(transport.addressValidationTelemetry.addressFamilyCounts, {
    ipv4: 2,
    ipv6: 0,
    other: 0,
  });
  assert.deepEqual(transport.addressValidationTelemetry.rejectingRules, ["ipv4-private-use"]);
  assert.doesNotMatch(JSON.stringify(dnsReport), /10\.0\.0\.8|addresses/);
});

test("does not attribute a failed refresh with retained cache to the current live run", () => {
  const report = buildAcceptanceReport({
    project: { name: "Cached Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      durationMs: 90_000,
      payload: {
        researchAudit: {
          provider: "openai",
          model: "gpt-4o",
          providerResponseIds: ["resp_old"],
          startedAt: "2026-09-07T10:00:00.000Z",
          finishedAt: "2026-09-07T10:00:04.000Z",
          elapsedMs: 4_000,
          physicalOpenBudget: 24,
          physicalOpensUsed: 24,
          physicalOpensRemaining: 0,
          physicalOpenBudgetExceeded: true,
          categoryGaps: [],
          categories: [{
            categoryId: "water",
            label: "Water",
            state: "Not searched",
            followUpSkipReason: "physical-open-budget",
            accessLimitations: ["The physical document-open ceiling was reached before this category was attempted."],
            unresolvedGaps: ["water_rights"],
            stageCounts: { notAttempted: 3 },
          }],
        },
        researchCoverage: {
          physicalOpenBudget: 24,
          physicalOpensUsed: 24,
          physicalOpensRemaining: 0,
          physicalOpenBudgetExceeded: true,
        },
        sourceLedger: [{
          url: "https://example.gov/old",
          sourceState: "claim-supported",
          accessOutcome: { state: "accessible" },
        }],
        researchCache: {
          state: "stale",
          refreshStatus: "failed",
          providerAvailable: false,
          errorType: "timeout",
        },
      },
    },
    failureRun: null,
    generatedAt: "2026-09-08T10:00:00.000Z",
  });

  assert.equal(report.run.status, "incomplete-technical-limitation");
  assert.equal(report.run.telemetryStatus, "historical-retained");
  assert.equal(report.run.failureType, "timeout");
  assert.equal(report.run.elapsedMs, 90_000);
  assert.equal(report.executedQueries.length, RESEARCH_CATEGORIES.length);
  assert.equal(report.executedQueries.every((category) => category.executedQueries.length === 0), true);
  assert.equal(report.sourceStates.total, 0);
  assert.equal(report.categoryGaps.length, RESEARCH_CATEGORIES.length);
  assert.equal(report.retainedHistoricalRun.providerResponseIds[0], "resp_old");
  assert.equal(report.retainedHistoricalRun.telemetryStatus, "historical-retained");
  assert.equal(report.retainedHistoricalRun.physicalOpenBudget, 24);
  assert.equal(report.retainedHistoricalRun.physicalOpensUsed, 24);
  assert.equal(report.retainedHistoricalRun.physicalOpensRemaining, 0);
  assert.equal(report.retainedHistoricalRun.physicalOpenBudgetExceeded, true);
  assert.equal(report.retainedHistoricalRun.categories[0].followUpSkipReason, "physical-open-budget");
  assert.equal(report.retainedHistoricalRun.categories[0].stageCounts.notAttempted, 3);
  assert.equal(report.cacheState.telemetryStatus, "historical-retained");
  assert.equal(report.budgetState.telemetryStatus, "historical-retained");
  assert.equal(report.budgetState.physicalOpensUsed, 24);
  assert.equal(report.sessionState.telemetryStatus, "historical-retained");
  assert.match(report.providerLimitations.at(-1), /historical data/i);
});