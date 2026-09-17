import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_CATEGORIES,
  RESEARCH_RUN_BUDGET,
} from "./researchProjectProxy.mjs";
import { buildAcceptanceReport } from "./researchProjectAcceptance.mjs";

test("builds a diagnostic-only report with bounded live-run and retention fields", () => {
  const report = buildAcceptanceReport({
    project: { name: "Live Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
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
  assert.equal(report.run.status, "useful-completion");
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

test("reports LIVE ACCEPTANCE BLOCKED when no eligible source reaches a visible finding", () => {
  const report = buildAcceptanceReport({
    project: { name: "Blocked Atlas", location: "Maricopa County, Arizona" },
    liveRun: {
      statusCode: 200,
      payload: {
        researchStatus: "partial",
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
  assert.equal(report.liveAcceptance.status, "LIVE ACCEPTANCE BLOCKED");
  assert.deepEqual(report.liveAcceptance.trace, []);
  assert.match(report.liveAcceptance.reason, /eligible visible finding/i);
});

test("traces the supported source mapping instead of the first attached source", () => {
  const supportedUrl = "https://example.gov/atlas/supported";
  const report = buildAcceptanceReport({
    project: { name: "Mapped Atlas", location: "Texas" },
    liveRun: {
      statusCode: 200,
      payload: {
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
  assert.equal(report.liveAcceptance.status, "source-to-visible-finding");
  assert.equal(report.liveAcceptance.trace[0].sourceUrl, supportedUrl);
  assert.equal(report.liveAcceptance.trace[0].sourceTitle, "Supported exact-project record");
});

test("records the complete Arizona source-to-visible-finding trace across URL aliases", () => {
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
  assert.equal(report.liveAcceptance.status, "source-to-visible-finding");
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

  assert.equal(report.run.status, "failed");
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

  assert.equal(report.run.status, "failed");
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