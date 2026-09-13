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
  assert.equal(report.failureRetention.labeledStaleOrPartial, true);
  assert.equal("evidence" in report, false);
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
          categoryGaps: [],
          categories: [],
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
  assert.equal(report.run.failureType, "timeout");
  assert.equal(report.run.elapsedMs, 90_000);
  assert.equal(report.executedQueries.length, RESEARCH_CATEGORIES.length);
  assert.equal(report.executedQueries.every((category) => category.executedQueries.length === 0), true);
  assert.equal(report.sourceStates.total, 0);
  assert.equal(report.categoryGaps.length, RESEARCH_CATEGORIES.length);
  assert.equal(report.retainedHistoricalRun.providerResponseIds[0], "resp_old");
  assert.match(report.providerLimitations.at(-1), /historical data/i);
});