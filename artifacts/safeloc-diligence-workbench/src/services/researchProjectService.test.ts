import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateCashFlowModel } from "@/model/cashFlowEngine";
import { getAdvisorEvidenceSummary } from "@/model/advisorLens";
import {
  createDefaultAssumptionResearch,
  checkResearchStatus,
  containCustomResearchEvidence,
  CUSTOM_EVIDENCE_IDS,
  getResearchCategoryClaimAudits,
  getResearchStatusPresentation,
  deriveRetainedResearchFindings,
  parseResponse,
  researchProject,
  RESEARCH_PROJECT_TIMEOUT_MS,
  getResearchTelemetryMode,
  summarizeResearchAudit,
  summarizeSourceCoverage,
} from "./researchProjectService";

test("uses the persisted terminal outcome for status and gates proposal review on visible proposals", () => {
  const incomplete = getResearchStatusPresentation({
    outcome: {
      state: "incomplete-technical-limitation",
      eligibleEvidenceCount: 0,
      reasonCodes: ["physical-open-budget"],
    },
    researchMode: "ai-researched",
    eligibleProposalCount: 0,
  });
  assert.equal(incomplete.label, "Research incomplete · technical limitation");
  assert.equal(incomplete.mode, "research-incomplete");
  assert.equal(incomplete.proposalReview, false);

  const noProposal = getResearchStatusPresentation({
    outcome: {
      state: "complete-with-eligible-evidence",
      eligibleEvidenceCount: 1,
      reasonCodes: [],
    },
    researchMode: "ai-researched",
    eligibleProposalCount: 0,
  });
  assert.equal(noProposal.label, "Research complete · eligible evidence found");
  assert.equal(noProposal.proposalReview, false);

  const noEligibleEvidence = getResearchStatusPresentation({
    outcome: {
      state: "complete-no-eligible-evidence",
      eligibleEvidenceCount: 0,
      reasonCodes: ["no-financially-eligible-claims"],
    },
    researchMode: "research-incomplete",
    eligibleProposalCount: 0,
  });
  assert.equal(noEligibleEvidence.label, "Research complete · no eligible evidence");
  assert.equal(noEligibleEvidence.mode, "partial-public-source");

  const review = getResearchStatusPresentation({
    outcome: {
      state: "complete-with-eligible-evidence",
      eligibleEvidenceCount: 1,
      reasonCodes: [],
    },
    researchMode: "ai-researched",
    eligibleProposalCount: 1,
  });
  assert.equal(review.label, "Research complete · proposal review");
  assert.equal(review.proposalReview, true);
});

test("labels updated provider responses as live and retained cache responses as historical", () => {
  assert.equal(getResearchTelemetryMode(undefined), "current-live");
  assert.equal(getResearchTelemetryMode({
    key: "a".repeat(64), state: "updated", storedAt: "2026-09-17T12:00:00.000Z",
    refreshStatus: "idle", providerAvailable: true,
  }), "current-live");
  for (const cache of [
    { state: "fresh" as const, refreshStatus: "idle" as const, providerAvailable: true },
    { state: "stale" as const, refreshStatus: "failed" as const, providerAvailable: false },
    { state: "updated" as const, refreshStatus: "failed" as const, providerAvailable: false },
  ]) {
    assert.equal(getResearchTelemetryMode({
      key: "b".repeat(64), storedAt: "2026-09-17T12:00:00.000Z", ...cache,
    }), "historical-retained");
  }
});

const response = JSON.parse(readFileSync(
  new URL("../../tests/fixtures/research-project-synthetic.json", import.meta.url),
  "utf8",
));

test("accepts the exact 16-item custom research contract", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.evidence.length, 16);
  assert.equal(parsed.projectSummary.capacityMW, null);
  assert.equal(parsed.projectSummary.capacityProvenance, "unknown");
  assert.doesNotMatch(parsed.projectSummary.description, /\b480\b|2028/);
});

test("retains exact scoped passages and separates project support, attributed reporting, ambiguity, and finance eligibility", () => {
  const parsed = parseResponse(response, {
    name: "Aster Northstar Campus",
    location: "Cedar County, Iowa",
    knownData: { operator: "Northstar Infrastructure", state: "Iowa" },
  });
  const findings = parsed.retainedFindings ?? [];
  assert.equal(findings.length, 3);
  assert.equal(findings.filter((finding) => finding.assessment === "source-supported").length, 1);
  assert.equal(findings.filter((finding) => finding.assessment === "attributed-report").length, 1);
  assert.equal(findings.filter((finding) => finding.assessment === "ambiguous-unresolved").length, 1);

  const phaseFinding = findings.find((finding) => finding.assessment === "source-supported");
  assert.match(phaseFinding?.passage ?? "", /Phase One utility interconnection was announced at 180 MW/);
  assert.equal(phaseFinding?.powerMeasure, "utility/grid service or interconnection");
  assert.equal(phaseFinding?.financialProposalEligibility, "unresolved");
  assert.match(phaseFinding?.statement ?? "", /The Phase One utility interconnection was announced at 180 MW/);
  assert.equal(phaseFinding?.reportingDate, "2025-03-18");
  assert.equal(phaseFinding?.reportingDateBasis, "retrieved-source-metadata");
  assert.equal(phaseFinding?.accessedAt, "2026-03-04");
  assert.equal(phaseFinding?.accessedAtBasis, "retrieval-time");

  const itLoadFinding = findings.find((finding) => finding.powerMeasure === "IT load/capacity");
  assert.equal(itLoadFinding?.assessment, "attributed-report");
  assert.equal(itLoadFinding?.powerMeasure, "IT load/capacity");
  assert.equal(findings.some((finding) => /Dayton|Oak Harbor/.test(finding.passage)), false);
  assert.equal(parsed.retainedFindingAudit?.unrelatedExcludedCount, 2);
  const duplicatePassage = parseResponse({
    ...response,
    sourceLedger: [...response.sourceLedger, response.sourceLedger[0]],
  }, {
    name: "Aster Northstar Campus",
    location: "Cedar County, Iowa",
    knownData: { operator: "Northstar Infrastructure", state: "Iowa" },
  });
  assert.equal(duplicatePassage.retainedFindings?.length, findings.length);
  assert.equal(duplicatePassage.retainedFindingAudit?.duplicateExcludedCount, 1);
  assert.equal(parsed.retainedFindingAudit?.financiallyEligibleCount, 0);
  assert.equal(parsed.projectSummary.capacityMW, null);
  assert.equal(parsed.projectSummary.capacityProvenance, "unknown");
  assert.equal(parsed.eligibleEvidence?.length, 0);
  assert.match(parsed.projectSummary.description, /Generated project-summary prose is withheld/);
  assert.doesNotMatch(parsed.projectSummary.description, /480 MW|2028/);
  assert.equal(parsed.researchStatus, "partial");
  assert.equal(parsed.researchMode, "partial-public-source");
});

function retainedPassage(passage: string, exactProject = true, sourceClass = "primary-government") {
  return {
    title: "Project record",
    url: `https://records.example.gov/${encodeURIComponent(passage.slice(0, 24))}`,
    exactProject,
    sourceClass,
    accessOutcome: { state: "accessible", passage },
  };
}

test("repairs retained applicability from source name, aliases, operator, city, county, and state", () => {
  const identity = {
    name: "Project Atlas",
    location: "Irving, Dallas County, Texas",
    knownData: { aliases: ["Atlas Compute Campus"], operator: "Atlas Compute", city: "Irving", county: "Dallas County", state: "Texas" },
  };
  const texasWithVirginiaHq = deriveRetainedResearchFindings([retainedPassage(
    "Project Atlas is located in Irving, Dallas County, Texas. Atlas Compute operates the facility; its headquarters are in Virginia.",
  )], identity);
  assert.equal(texasWithVirginiaHq[0]?.applicability, "exact-project");

  const exactWestVirginia = deriveRetainedResearchFindings([retainedPassage(
    "Atlas Compute Campus is located in Morgantown, Monongalia County, West Virginia.",
  )], {
    name: "Project Atlas",
    location: "Morgantown, Monongalia County, West Virginia",
    knownData: {
      aliases: ["Atlas Compute Campus"],
      operator: "Atlas Compute",
      city: "Morgantown",
      county: "Monongalia County",
      state: "WV",
    },
  });
  assert.equal(exactWestVirginia[0]?.applicability, "exact-project");

  const wrongLocation = deriveRetainedResearchFindings([retainedPassage(
    "Project Atlas is located in Austin, Travis County, Virginia.",
  )], identity);
  assert.equal(wrongLocation.length, 0);

  const missingDetails = deriveRetainedResearchFindings([retainedPassage(
    "Project Atlas was mentioned in a regional development report.",
  )], { name: "Project Atlas", location: "Texas" });
  assert.equal(missingDetails[0]?.assessment, "ambiguous-unresolved");
  assert.equal(missingDetails[0]?.applicability, "ambiguous");
});

test("ranks all retained passages before cap and audits cap discards", () => {
  const passages = Array.from({ length: 8 }, (_, index) =>
    retainedPassage(`Project Atlas was mentioned in a regional article, entry ${index + 1}.`));
  passages.push(retainedPassage(
    "Project Atlas is located in Dallas, Texas. The facility has a stated interconnection capacity of 240 MW.",
    true,
    "secondary-reporting",
  ));
  passages.push(retainedPassage(
    "Project Atlas is located in Dallas, Texas. Its Phase One interconnection was approved at 320 MW.",
  ));
  const result = parseResponse({ ...response, sourceLedger: passages }, {
    name: "Project Atlas",
    location: "Dallas, Texas",
    knownData: { city: "Dallas", state: "Texas" },
  });
  const findings = result.retainedFindings ?? [];
  assert.equal(findings.length, 8);
  assert.equal(findings[0]?.assessment, "source-supported");
  assert.equal(findings[1]?.assessment, "attributed-report");
  assert.equal(result.retainedFindingAudit?.totalFindingCount, 10);
  assert.equal(result.retainedFindingAudit?.shownFindingCount, 8);
  assert.equal(result.retainedFindingAudit?.capDiscardCount, 2);
  assert.equal(findings[0]?.statement, "Project Atlas is located in Dallas, Texas.");
  assert.equal(findings[0]?.financialProposalEligibility, "unresolved");
  assert.equal(findings.every((finding) => finding.demonstratedFinancialEffect === false), true);
  assert.equal(result.retainedFindingAudit?.financiallyEligibleCount, 0);
  assert.equal(result.projectSummary.capacityMW, null);
  assert.equal(result.projectSummary.capacityProvenance, "unknown");
  assert.equal(result.eligibleEvidence?.length, 0);
});

test("preserves eligible server evidence through client parsing", () => {
  const source = {
    url: "https://example.com/atlas/filing",
    title: "Atlas filed tariff",
    publisher: "example.com",
    publishedAt: "2026-06-01",
    accessedAt: "2026-08-30",
    accessStatus: "open" as const,
    excerpt: "The Atlas facility electricity cost is 48 USD/MWh.",
    claimPassage: "The Atlas facility electricity cost is 48 USD/MWh.",
    sourceClass: "primary-company" as const,
    searchDomain: "electricity",
    relationship: "primary" as const,
    exactProject: true,
    facilityScope: "exact-facility",
    phaseScope: "not-applicable",
    timePeriod: "2026",
  };
  const valid = structuredClone(response);
  valid.evidence[0] = {
    ...valid.evidence[0],
    value: 48,
    unit: "USD/MWh",
    numericValue: 48,
    classification: "Management Assertion",
    sourceUrl: source.url,
    sourceRelevance: "exact-project",
    coverageStatus: "supported",
    sourceSupportConfidence: 94,
    claimPassage: source.claimPassage,
    facilityScope: "exact-facility",
    phaseScope: "not-applicable",
    claimTimePeriod: "2026",
    sources: [source],
  };
  const parsed = parseResponse(valid);
  const evidence = parsed.evidence[0];
  assert.equal(evidence.eligibleForModel, true);
  assert.equal(evidence.acceptedForModel, false);
  assert.notEqual(evidence.researchState, "accepted");
  assert.equal(parsed.acceptedModelInputs?.length, 0);
  assert.equal(parsed.proposedInputs?.length, 1);
  assert.equal(evidence.sourceValidation?.state, "financially-eligible");
});

test("projects retained passages and non-evidence access receipts into category traces", () => {
  const valid = structuredClone(response);
  const source = {
    url: "https://example.com/atlas/filing.pdf",
    resolvedUrl: "https://example.com/atlas/filing.pdf?download=1",
    title: "Atlas filing",
    publisher: "example.com",
    publishedAt: null,
    accessedAt: null,
    accessStatus: "open" as const,
    excerpt: "The Atlas facility electricity cost is 48 USD/MWh.",
    claimPassage: "The Atlas facility electricity cost is 48 USD/MWh.",
    sourceClass: "primary-company" as const,
    searchDomain: "electricity",
    relationship: "primary" as const,
    exactProject: true,
    claimSupport: [{ evidenceId: "electricity_cost", value: "48 USD/MWh" }],
    facilityScope: "exact-facility",
    phaseScope: "not-applicable",
    timePeriod: "2026",
    accessOutcome: {
      state: "accessible" as const,
      reason: "retrieved",
      format: "text-pdf",
      resolvedUrl: "https://example.com/atlas/filing.pdf?download=1",
      passage: "The Atlas facility electricity cost is 48 USD/MWh.",
      pageOrSection: 4,
      extractionLimitations: ["Page references are unavailable from the bounded text extractor."],
    },
  };
  const blocked = {
    ...source,
    url: "https://example.com/atlas/blocked.pdf",
    resolvedUrl: "https://example.com/atlas/blocked.pdf",
    accessOutcome: {
      state: "blocked" as const,
      reason: "http-403",
      format: "text-pdf",
      resolvedUrl: "https://example.com/atlas/blocked.pdf",
      passage: null,
      pageOrSection: null,
      extractionLimitations: ["The source could not be accessed."],
    },
  };
  const unsupported = {
    ...source,
    url: "https://example.com/atlas/scan.pdf",
    resolvedUrl: "https://example.com/atlas/scan.pdf",
    accessOutcome: {
      state: "unsupported" as const,
      reason: "scanned-pdf",
      format: "text-pdf",
      resolvedUrl: "https://example.com/atlas/scan.pdf",
      passage: null,
      pageOrSection: null,
      extractionLimitations: ["PDF contained no extractable text; OCR is not performed."],
    },
  };
  valid.evidence[0] = {
    ...valid.evidence[0],
    value: 48,
    unit: "$/MWh",
    numericValue: 48,
    sourceUrl: source.url,
    sourceRelevance: "exact-project",
    coverageStatus: "supported",
    sources: [source, blocked, unsupported],
  };
  const parsed = parseResponse(valid);
  const traces = getResearchCategoryClaimAudits({
    categoryId: "electricity",
    label: "Electricity",
    evidenceIds: ["electricity_cost"],
    requestedPrimaryQuery: "Project Atlas electricity",
    executedQueries: ["Project Atlas electricity"],
    state: "Partial",
    stageCounts: { normalized: 3, accessed: 1, parsed: 1, claimMapped: 1, eligible: 1, retainedCandidates: 3 },
    rejectionCounts: {},
    accessLimitations: [],
    unresolvedGaps: [],
  }, parsed.evidence);
  assert.equal(traces.length, 3);
  const retained = traces.find((trace) => trace.accessState === "accessible");
  assert.equal(retained?.resolvedUrl, "https://example.com/atlas/filing.pdf?download=1");
  assert.equal(retained?.retainedPassage, "The Atlas facility electricity cost is 48 USD/MWh.");
  assert.equal(retained?.pageOrSection, 4);
  assert.deepEqual(retained?.extractionLimitations, ["Page references are unavailable from the bounded text extractor."]);
  assert.equal(traces.find((trace) => trace.accessState === "blocked")?.accessReason, "http-403");
  assert.equal(traces.find((trace) => trace.accessState === "unsupported")?.accessReason, "scanned-pdf");
});

test("containment rejects residential tariffs and preserves raw incompatible units", () => {
  const contained = containCustomResearchEvidence({
    id: "electricity_cost",
    label: "Electricity Cost",
    value: 7.3,
    unit: "cents/kWh",
    numericValue: 7.3,
    classification: "Verified Evidence",
    citation: "Residential tariff schedule",
    description: "Residential electricity rate for households.",
    sourceRole: "AI-researched",
    sourceRelevance: "exact-project",
    sourceSupportConfidence: 94,
    coverageStatus: "supported",
    sourceUrl: "https://example.com/rate",
    sources: [{
      url: "https://example.com/rate",
      title: "Residential tariff",
      publisher: "example.com",
      publishedAt: null,
      accessedAt: null,
      accessStatus: "open",
      excerpt: "Residential household rate: 7.3 cents/kWh.",
      claimPassage: "Residential household rate: 7.3 cents/kWh.",
      sourceClass: "primary-utility",
      searchDomain: "project-identity",
      relationship: "primary",
      exactProject: true,
      claimSupport: [{ evidenceId: "electricity_cost", value: "7.3 cents/kWh" }],
      facilityScope: "exact-facility",
      phaseScope: "not-applicable",
      timePeriod: "2026",
    }],
  });
  assert.equal(contained.eligibleForModel, false);
  assert.equal(contained.rawValue, 7.3);
  assert.equal(contained.rawUnit, "cents/kWh");
  assert.match(contained.quarantineReasons?.join(" ") ?? "", /residential|incompatible/i);
  const duration = containCustomResearchEvidence({
    id: "grid_interconnection",
    label: "Grid Interconnection Timeline",
    value: 365,
    unit: "days",
    numericValue: 365,
    classification: "Verified Evidence",
    citation: "Exact project filing",
    description: "Exact project timeline.",
    sourceRole: "AI-researched",
    sources: [{
      url: "https://example.com/grid",
      title: "Project filing",
      publisher: "example.com",
      publishedAt: null,
      accessedAt: null,
      accessStatus: "open",
      excerpt: "365 days",
      claimPassage: "365 days",
      sourceClass: "primary-government",
      searchDomain: "project-identity",
      relationship: "primary",
      exactProject: true,
      claimSupport: [{ evidenceId: "grid_interconnection", value: "365 days" }],
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    }],
    sourceSupportConfidence: 94,
  });
  assert.equal(duration.eligibleForModel, true);
  assert.equal(duration.normalizedUnit, "months");
  assert.ok(Math.abs((duration.normalizedValue ?? 0) - (365 / 30.4375)) < 0.01);
  const recontained = containCustomResearchEvidence(duration);
  assert.equal(recontained.normalizedUnit, "months");
  assert.equal(recontained.normalizedValue, duration.normalizedValue);
  assert.equal(recontained.numericValue, duration.numericValue);
  assert.equal(recontained.rawValue, 365);
  assert.equal(recontained.rawUnit, "days");
});

test("full client parsing remains idempotent when containment runs twice", () => {
  const source = structuredClone(response);
  const timeline = source.evidence.find((item) => item.id === "grid_interconnection");
  timeline.value = 365;
  timeline.unit = "days";
  timeline.numericValue = 365;
  const first = parseResponse(source);
  const second = parseResponse(first);
  const firstTimeline = first.evidence.find((item) => item.id === "grid_interconnection");
  const secondTimeline = second.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(firstTimeline.normalizedUnit, "months");
  assert.equal(secondTimeline.normalizedUnit, "months");
  assert.equal(secondTimeline.normalizedValue, firstTimeline.normalizedValue);
  assert.equal(secondTimeline.numericValue, firstTimeline.numericValue);
  assert.equal(secondTimeline.rawValue, 365);
  assert.equal(secondTimeline.rawUnit, "days");
});

test("keeps model self-confidence separate from source support and every model output", () => {
  const parseWithConfidence = (score: unknown) => parseResponse({
    ...response,
    evidence: response.evidence.map((item) => ({
      ...item,
      sourceUrl: undefined,
      sourceSupportConfidence: 0,
      modelReportedConfidence: score,
    })),
  });
  const low = parseWithConfidence(0);
  const high = parseWithConfidence(99);
  assert.equal(high.evidence[0].modelReportedConfidence, 99);
  assert.equal(high.evidence[0].sourceSupportConfidence, 0);
  assert.equal(high.evidence[0].classification, "Missing Evidence");
  const asRecord = (parsed: typeof high) => Object.fromEntries(parsed.evidence.map((item) => [item.id, item]));
  assert.deepEqual(calculateCashFlowModel(asRecord(high)), calculateCashFlowModel(asRecord(low)));
  assert.deepEqual(getAdvisorEvidenceSummary(asRecord(high)), getAdvisorEvidenceSummary(asRecord(low)));
  assert.deepEqual(summarizeResearchAudit(high.evidence), summarizeResearchAudit(low.evidence));
  for (const invalid of [undefined, null, "99", -1, 101, NaN, Infinity]) {
    assert.equal(parseWithConfidence(invalid).evidence[0].modelReportedConfidence, undefined);
  }
  assert.equal(parseWithConfidence(73.6).evidence[0].modelReportedConfidence, 74);
  assert.equal(createDefaultAssumptionResearch("Fallback", "Texas").evidence[0].modelReportedConfidence, undefined);
});

test("source URLs without exact-project validation remain partial and quarantined", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.researchMode, "partial-public-source");
  assert.equal(parsed.eligibleEvidence?.length, 0);
  assert.equal(parsed.proposedInputs?.length, 0);
  assert.equal(parsed.retrievedLeads?.length, 16);
});

test("reports mutually exclusive source coverage counts that total sixteen", () => {
  const parsed = parseResponse({
    ...response,
    evidence: response.evidence.map((item, index) => index === 1
      ? {
          ...item,
          value: "Company-reported arrangement",
          classification: "Management Assertion" as const,
        }
      : item),
  });
  const coverage = summarizeSourceCoverage(parsed.evidence);
  assert.deepEqual(coverage, { supported: 0, aiKnowledge: 1, missing: 15 });
  assert.equal(coverage.supported + coverage.aiKnowledge + coverage.missing, 16);
});

test("retains the complete bounded response-level search audit beyond eight queries", () => {
  const queries = Array.from({ length: 32 }, (_, i) => `Project Atlas targeted query ${i}`);
  const result = parseResponse({
    ...response,
    researchCoverage: { searchTerms: queries, searchTermsSource: "tool-observed", toolCallCount: 33, toolCallLimit: 32, toolCallBudgetExceeded: true },
  });
  assert.deepEqual(result.researchCoverage?.searchTerms, queries);
  assert.equal(result.researchCoverage?.searchTermsSource, "tool-observed");
  assert.equal(result.researchCoverage?.toolCallCount, 33);
  assert.equal(result.researchCoverage?.toolCallBudgetExceeded, true);
});

test("keeps capacity unknown when returned AI values are malformed or unsupported", () => {
  for (const capacityMW of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 10_001, "2,000 MW"]) {
    const parsed = parseResponse({
      ...response,
      projectSummary: { ...response.projectSummary, capacityMW },
    });
    assert.equal(parsed.projectSummary.capacityMW, null);
    assert.equal(parsed.projectSummary.capacityProvenance, "unknown");
  }
  const directoryReported = parseResponse(response, { knownData: { capacity: 980 } });
  assert.equal(directoryReported.projectSummary.capacityMW, 980);
  assert.equal(directoryReported.projectSummary.capacityProvenance, "directory-reported");
});

test("rejects custom responses with a missing modeled item", () => {
  assert.throws(() => parseResponse({ ...response, evidence: response.evidence.slice(0, 15) }), /exactly 16/i);
});

test("keeps only safe direct source links from custom responses", () => {
  const parsed = parseResponse(response);
  assert.equal(parsed.evidence[0].sourceUrl, "https://northstar.example/announcements/phase-one");
  assert.equal(parsed.evidence[0].sourceTitle, "Northstar Infrastructure announcement");
  assert.equal(parsed.evidence[0].sourcePublishedAt, "2025-03-18");
  assert.equal(parsed.evidence[0].sourceAccessStatus, "open");

  const unsafe = {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      sourceUrl: index === 0 ? "javascript:alert(1)" : "https://user:pass@example.com/source",
    })),
  };
  assert.equal(parseResponse(unsafe).evidence.every((item) => item.sourceUrl === undefined), true);
});

test("aggregates unique sources and support quality without counting missing items as supported", () => {
  const parsed = parseResponse({
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      sourceSupportConfidence: index === 0 ? 82 : index === 1 ? 94 : 0,
      ...(index < 2 ? {
        sources: [{
          url: index === 0 ? "https://example.com/atlas/source" : "https://example.com/atlas/second",
          title: "Source",
          publisher: "example.com",
          publishedAt: null,
          accessedAt: null,
          accessStatus: "not provided",
          excerpt: "Excerpt",
          sourceClass: "secondary-reporting",
          searchDomain: "project-identity",
          relationship: "primary",
          relevanceNote: "Mapped to the claim.",
        }],
      } : {}),
    })),
  });
  const audit = summarizeResearchAudit(parsed.evidence);
  assert.deepEqual(audit, {
    uniqueValidatedSourceCount: 0,
    averageSourceSupportConfidence: 11,
    strongSupportItemCount: 1,
    noSourceItemCount: 14,
  });
});

test("aligns the browser request budget with the server-owned research deadline", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 90_000);
});

test("returns the first timeout without issuing an automatic retry", async () => {
  let calls = 0;
  const progress: string[] = [];
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: "Atlas",
      location: "Texas",
      knownData: {
        capacity: 800,
        operator: "Atlas Compute",
        status: "Operating",
        sourceUrl: "https://example.com/directory/atlas",
      },
    });
    return calls === 1
      ? new Response(JSON.stringify({ error: "Project research timed out." }), { status: 504 })
      : new Response(JSON.stringify(response), { status: 200 });
  };
  await assert.rejects(
    researchProject("Atlas", "Texas", fetchImpl as typeof fetch, {
      knownData: {
        capacity: 800,
        operator: "Atlas Compute",
        status: "Operating",
        sourceUrl: "https://example.com/directory/atlas",
      },
      onProgress: (state) => progress.push(state),
    }),
    /timed out/i,
  );
  assert.equal(calls, 1);
  assert.deepEqual(progress, ["researching"]);
});

test("does not retry non-timeout failures", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "Provider rejected the request." }), { status: 502 });
  };
  await assert.rejects(() => researchProject("Atlas", "Texas", fetchImpl as typeof fetch), /Provider rejected/);
  assert.equal(calls, 1);
});

test("preserves cache freshness metadata and sends explicit force refresh", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const cacheKey = "a".repeat(64);
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      ...response,
      researchCache: {
        key: cacheKey,
        state: "stale",
        storedAt: "2026-09-01T12:00:00.000Z",
        refreshStatus: "failed",
        providerAvailable: false,
        errorType: "quota-exhausted",
      },
    }), { status: 200 });
  };
  const result = await researchProject("Atlas", "Texas", fetchImpl as typeof fetch, { forceRefresh: true });
  assert.deepEqual(requestBody, { name: "Atlas", location: "Texas", forceRefresh: true });
  assert.deepEqual(result.researchCache, {
    key: cacheKey,
    state: "stale",
    storedAt: "2026-09-01T12:00:00.000Z",
    refreshStatus: "failed",
    providerAvailable: false,
    errorType: "quota-exhausted",
  });
});

test("preserves retained physical-open diagnostics without treating them as fresh telemetry", () => {
  const retained = structuredClone(response);
  retained.researchCache = {
    key: "c".repeat(64),
    state: "stale",
    storedAt: "2026-09-01T12:00:00.000Z",
    refreshStatus: "failed",
    providerAvailable: false,
    errorType: "timeout",
  };
  retained.researchCoverage = {
    searchedDomains: [],
    failedDomains: [],
    retrievedSourceCount: 3,
    searchTerms: [],
    searchTermsSource: "unavailable",
    physicalOpenBudget: 24,
    physicalOpensUsed: 24,
    physicalOpensRemaining: 0,
    physicalOpenBudgetExceeded: true,
  };
  retained.researchAudit = {
    provider: "openai",
    model: "gpt-4o",
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
  };

  const parsed = parseResponse(retained);
  assert.equal(parsed.researchCache?.refreshStatus, "failed");
  assert.equal(parsed.researchCache?.providerAvailable, false);
  assert.equal(parsed.researchAudit?.physicalOpensUsed, 24);
  assert.equal(parsed.researchAudit?.physicalOpensRemaining, 0);
  assert.equal(parsed.researchAudit?.physicalOpenBudgetExceeded, true);
  assert.equal(parsed.researchAudit?.categories[0].followUpSkipReason, "physical-open-budget");
  assert.equal(parsed.researchAudit?.categories[0].stageCounts.notAttempted, 3);
  assert.equal(parsed.researchCoverage?.physicalOpenBudgetExceeded, true);
});

test("checks background refresh status and parses a completed result", async () => {
  const cacheKey = "b".repeat(64);
  const result = await checkResearchStatus(cacheKey, async (input) => {
    assert.match(String(input), new RegExp(cacheKey));
    return new Response(JSON.stringify({
      researchCache: {
        key: cacheKey,
        state: "fresh",
        storedAt: "2026-09-03T12:00:00.000Z",
        refreshStatus: "completed",
        providerAvailable: true,
      },
      result: response,
    }), { status: 200 });
  });
  assert.equal(result.researchCache.refreshStatus, "completed");
  assert.equal(result.result?.evidence.length, 16);
});

test("creates an explicitly labeled 16-item Missing Evidence fallback", () => {
  const fallback = createDefaultAssumptionResearch("Atlas", "Taylor County, Texas", {
    capacity: 880,
    operator: "Atlas Compute",
    status: "Planned",
    sourceUrl: "https://example.com/directory/atlas",
  });
  assert.equal(fallback.researchMode, "default-assumptions");
  assert.equal(fallback.projectSummary.capacityMW, 880);
  assert.equal(fallback.projectSummary.capacityProvenance, "directory-reported");
  assert.equal(fallback.evidence.length, 16);
  assert.equal(fallback.evidence.every((item) => item.classification === "Missing Evidence"), true);
  assert.equal(fallback.evidence.every((item) => item.sourceUrl === undefined), true);
  const noDirectoryCapacity = createDefaultAssumptionResearch("Atlas", "Taylor County, Texas");
  assert.equal(noDirectoryCapacity.projectSummary.capacityMW, null);
  assert.equal(noDirectoryCapacity.projectSummary.capacityProvenance, "unknown");
});

test("preserves server-normalized varied classifications and partial coverage", () => {
  const varied = {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      value: index === 0 ? 48 : `Finding ${index + 1}`,
      classification: index === 0
        ? "Management Assertion"
        : index === 1
          ? "Model Inference"
          : index === 2
            ? "User Assumption"
            : item.classification,
      coverageStatus: index < 3 ? "partial" : "searched-no-support",
      citation: index === 0
        ? "AI classification downgraded: cited source not in retrieved search results. Original classification: Verified Evidence."
        : item.citation,
    })),
  };
  const parsed = parseResponse(varied);
  assert.deepEqual(
    parsed.evidence.slice(0, 3).map((item) => item.classification),
    ["Management Assertion", "Model Inference", "User Assumption"],
  );
  assert.equal(parsed.evidence[0].coverageStatus, "partial");
  assert.match(parsed.evidence[0].citation, /classification downgraded/i);
});