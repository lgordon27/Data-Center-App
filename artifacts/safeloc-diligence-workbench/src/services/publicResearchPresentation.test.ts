import test from "node:test";
import assert from "node:assert/strict";
import {
  getPublicCategoryPresentation,
  getPublicResearchFailure,
  getPublicResearchPresentation,
  parseBoundedRetryAfter,
  PublicResearchRequestError,
} from "./publicResearchPresentation.js";
import type { ResearchCategoryAudit } from "./researchProjectService.js";

function category(overrides: Partial<ResearchCategoryAudit> = {}): ResearchCategoryAudit {
  return {
    categoryId: "power",
    label: "Power",
    evidenceIds: [],
    requestedPrimaryQuery: "Not available",
    executedQueries: [],
    followUpCount: 0,
    followUpLimit: 1,
    state: "Not searched",
    stageCounts: { normalized: 0, accessed: 0, parsed: 0, claimMapped: 0, eligible: 0, retainedCandidates: 0 },
    rejectionCounts: {},
    accessLimitations: [],
    unresolvedGaps: [],
    ...overrides,
  };
}

test("unrun and failed categories remain incomplete, never a negative finding", () => {
  assert.equal(getPublicCategoryPresentation(category()).label, "Search incomplete");
  assert.equal(getPublicCategoryPresentation(category({ state: "Provider failure" })).label, "Search incomplete");
  assert.equal(
    getPublicResearchPresentation({ categories: [category()], evidenceCount: 0 }).state,
    "search-incomplete",
  );
});

test("retained evidence stays visible as partial after a failed refresh", () => {
  const presentation = getPublicResearchPresentation({
    researchStatus: "failed",
    hasRetainedEvidence: true,
    researchCache: {
      state: "stale",
      refreshStatus: "failed",
      providerAvailable: false,
      errorType: "upstream",
      storedAt: "2026-01-01T00:00:00.000Z",
    } as never,
  });
  assert.equal(presentation.state, "partial-results");
  assert.match(presentation.explanation, /retained/i);
});

test("blocked sources are distinct, while missing evidence alone never implies privacy", () => {
  const blocked = category({
    state: "Partial",
    openedDocuments: [{
      originalUrl: "https://example.test",
      resolvedUrl: "https://example.test",
      canonicalUrl: "https://example.test",
      opened: false,
      accessState: "blocked",
      accessOutcome: "blocked",
      reusedFromCanonicalUrl: null,
      retainedPassage: null,
      extractionLimitations: [],
    }],
  });
  assert.equal(getPublicCategoryPresentation(blocked).state, "source-blocked");
  assert.equal(getPublicResearchPresentation({ categories: [category()] }).state, "search-incomplete");
});

test("explicit rate limits and only canonical non-public metadata get distinct states", () => {
  assert.equal(
    getPublicCategoryPresentation(category({ providerFailureType: "provider-rate-limit" })).state,
    "provider-busy",
  );
  assert.equal(
    getPublicResearchPresentation({
      categories: [category({ state: "Complete", accessLimitations: ["evidence-likely-non-public"] })],
    }).state,
    "evidence-likely-non-public",
  );
  assert.equal(
    getPublicResearchPresentation({
      categories: [category({ accessLimitations: ["No public result was returned"] })],
    }).state,
    "search-incomplete",
  );
});

test("a negative terminal label never overrides an incomplete category or failed access", () => {
  for (const incomplete of [
    category(),
    category({ state: "Partial" }),
    category({ state: "No eligible evidence", providerFailureType: "upstream" }),
    category({ state: "Provider failure", accessLimitations: ["evidence-likely-non-public"] }),
  ]) {
    assert.equal(getPublicResearchPresentation({
      outcome: { state: "complete-no-eligible-evidence" },
      categories: [incomplete],
    }).state, "search-incomplete");
    assert.equal(getPublicResearchPresentation({
      outcome: { state: "complete-no-eligible-evidence" },
      categories: [incomplete],
      hasRetainedEvidence: true,
    }).state, "partial-results");
  }
  assert.equal(getPublicCategoryPresentation(category({
    state: "No eligible evidence", providerFailureType: "upstream",
  })).state, "search-incomplete");
});

test("older sparse metadata renders conservatively without invented completeness", () => {
  assert.equal(getPublicResearchPresentation({}).state, "search-incomplete");
  assert.equal(getPublicResearchPresentation({
    categories: [null, { openedDocuments: {}, accessLimitations: [null] }] as never,
  }).state, "search-incomplete");
  assert.equal(getPublicResearchPresentation({
    categories: [category({ state: "No eligible evidence" })],
  }).state, "no-qualifying-evidence");
  assert.equal(getPublicCategoryPresentation(category({
    state: "Complete", unresolvedGaps: ["likely-non-public"],
  })).state, "evidence-likely-non-public");
});

test("retry-after parsing is bounded and failure disclosures are curated", () => {
  assert.equal(parseBoundedRetryAfter("12"), 12);
  assert.equal(parseBoundedRetryAfter("9999"), 300);
  assert.equal(parseBoundedRetryAfter("invalid"), null);
  const failure = getPublicResearchFailure(new Error("secret provider response and stack"));
  assert.equal(failure.message.includes("secret"), false);
  assert.equal(failure.kind, "failed");
  assert.equal(new PublicResearchRequestError("busy", 10).retryAfterSeconds, 10);
});