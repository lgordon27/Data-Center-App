import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync, gunzipSync } from "node:zlib";
import { createResearchFunnelDiagnostics } from "./researchFunnelDiagnostics.mjs";

import {
  DEFAULT_RESEARCH_CAPACITY_MW,
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_CATEGORY_MAX_TOKENS,
  RESEARCH_PROJECT_MAX_TOOL_CALLS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_RUN_BUDGET,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  RESEARCH_QUERY_ANGLES,
  buildResearchProjectPrompt,
  buildVariableQueries,
  buildVariableQueryPlan,
  handleResearchProjectRequest as handleResearchProjectRequestWithTestGate,
  parseResearchResponse as parseResearchResponseUnchecked,
  createResearchProjectRateLimiter,
  createResearchProviderGate,
  safePublicSourceUrl,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  normalizeRetrievedSources,
  extractResearchSourceUrls,
  extractSearchTerms,
  extractObservedQueriesByEvidence,
  countWebSearchCalls,
  normalizeModelReportedConfidence,
  calculateSourceSupportConfidence,
  containResearchResult as containResearchResultUnchecked,
  buildResearchAudit,
  buildResearchCategoryPlan,
  buildProjectIdentityContext,
  mergeCategoryResearchResults,
  buildCategoryFollowUpQuery,
  evaluateResearchDocumentAccess,
  accessResearchDocument,
  createPinnedLookup,
  resolvePublicAddress,
  orchestrateCategoryResearch,
  runValidatedResearch as runValidatedResearchWithTestGate,
  researchProjectWithWebSearch as researchProjectWithWebSearchWithTestGate,
  classifyResearchFailure,
  classifyCanonicalResearchOutcome,
  createPhysicalOpenScheduler,
  sourceEstablishesProjectIdentity,
  sourceEstablishesRelatedFacilityIdentity,
  evaluateCanaryGridIdentityGate,
  PROTECTED_SOURCE_OPPORTUNITIES,
  replayResearchCategoryPassageInput,
  selectResearchPassagesForStructuredAnalysis,
} from "./researchProjectProxy.mjs";
import {
  buildClaimPassageMappings,
  evaluateResearchEvidenceEligibility,
} from "../src/data/sourceValidationPolicy.mjs";
import {
  classifyResearchCacheAge,
  createResearchProjectCache,
  researchProjectCacheKey,
} from "./researchProjectCache.mjs";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";
import { parseGoogleGroundedDiscoveryResponse } from "./googleGroundedDiscovery.mjs";

const OFFLINE_PROVIDER_TOKEN_WINDOW_MS = 10;

// Isolate offline runs while keeping the production-default TPM ceiling.
// Shared-gate behavior is covered directly with simulated-clock tests.
function runValidatedResearch(project, options = {}) {
  return runValidatedResearchWithTestGate(project, {
    providerGate: createResearchProviderGate({
      tokensPerMinute: 30_000,
      tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
    }),
    ...options,
  });
}

function handleResearchProjectRequest(req, res, options = {}) {
  return handleResearchProjectRequestWithTestGate(req, res, {
    providerGate: createResearchProviderGate({
      tokensPerMinute: 30_000,
      tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
    }),
    ...options,
  });
}

function researchProjectWithWebSearch(project, apiKey, fetchImpl, signal, activeCategory, providerGate) {
  return researchProjectWithWebSearchWithTestGate(
    project,
    apiKey,
    fetchImpl,
    signal,
    activeCategory,
    providerGate ?? createResearchProviderGate({
      tokensPerMinute: 30_000,
      tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
    }),
  );
}

async function withEnvironmentVariable(name, value, callback) {
  const original = process.env[name];
  process.env[name] = String(value);
  try {
    return await callback();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

async function withOpenAiTpmLimit(limit, callback) {
  return withEnvironmentVariable("OPENAI_TPM_LIMIT", limit, callback);
}

async function withResearchCategoryInputTokenCap(cap, callback) {
  return withEnvironmentVariable("RESEARCH_CATEGORY_INPUT_TOKEN_CAP", cap, callback);
}

const redOakQualityFixtures = JSON.parse(readFileSync(
  new URL("./fixtures/red-oak-quality.json", import.meta.url),
  "utf8",
));

function assertRejectedEvidenceHasFailedTrace(result) {
  for (const item of result?.evidence ?? []) {
    if (item?.eligibleForModel !== false) continue;
    const checks = item.sourceValidation?.eligibilityTrace?.checks;
    assert.ok(
      Array.isArray(checks) && checks.some((check) => check.passed === false),
      `Rejected evidence ${item.id ?? "(unknown)"} must have a failed eligibility trace check.`,
    );
  }
  return result;
}

function parseResearchResponse(...args) {
  return assertRejectedEvidenceHasFailedTrace(parseResearchResponseUnchecked(...args));
}

function containResearchResult(...args) {
  return assertRejectedEvidenceHasFailedTrace(containResearchResultUnchecked(...args));
}

function completedGoogleDiscovery(candidates, query = "fixture exact-project public records") {
  return async () => ({
    status: "completed",
    provider: "google-gemini-grounding",
    model: "gemini-3.8-flash",
    queries: [query],
    candidates: candidates.map((candidate) => ({
      ...candidate,
      ...(candidate.canonicalUrl && candidate.url && candidate.canonicalUrl !== candidate.url
        ? { canonicalIdentityExplicit: true }
        : {}),
      categoryIds: candidate.categoryIds
        ?? (candidate.searchDomain ? [candidate.searchDomain] : []),
      referringQueries: candidate.referringQueries ?? [query],
      sourceChannel: candidate.sourceChannel ?? "google-grounded-search",
      origin: candidate.origin ?? "google-grounded-search",
      discoveryOnly: true,
    })),
    groundingMetadataPresent: true,
    groundingSearchExecuted: true,
    usableCitationMetadataPresent: candidates.length > 0,
    googleSearchCallCount: 1,
    googleSearchResultCount: 1,
    urlCitationCount: candidates.length,
    citationCount: candidates.length,
    providerRequestCount: 1,
  });
}

test("server identity agrees with retained-passage applicability and ignores HQ or comparison locations", () => {
  const texasProject = {
    name: "Project Atlas",
    location: "Irving, Dallas County, Texas",
    knownData: {
      aliases: ["Atlas Compute Campus"],
      operator: "Atlas Compute",
      city: "Irving",
      county: "Dallas County",
      state: "Texas",
    },
  };
  const source = (passage) => ({
    title: "Project Atlas official project record",
    url: "https://records.example.gov/project-atlas",
    exactProject: true,
    accessOutcome: { state: "accessible", passage },
  });

  assert.equal(sourceEstablishesProjectIdentity(source(
    "Project Atlas is located in Irving, Dallas County, Texas. Atlas Compute operates the facility; its headquarters are in Virginia.",
  ), texasProject), true);
  assert.equal(sourceEstablishesProjectIdentity(source(
    "Project Atlas is located in Irving, Dallas County, Texas, compared with a similar project in Richmond, Virginia.",
  ), texasProject), true,
  "the distinctive requested name and matching Irving location establish identity without operator attribution");
  assert.equal(sourceEstablishesProjectIdentity(source(
    "Project Atlas is located in Houston, Harris County, Texas.",
  ), texasProject), false);
  assert.equal(sourceEstablishesProjectIdentity(source(
    "Project Atlas is located in Irving, Dallas County, Texas and is operated by Different Operator.",
  ), texasProject), false,
  "an explicit operator conflict remains unrelated even when the distinctive name and location match");

  assert.equal(sourceEstablishesProjectIdentity(source(
    "Atlas Compute Campus is located in Morgantown, Monongalia County, WV.",
  ), {
    name: "Project Atlas",
    location: "Morgantown, Monongalia County, West Virginia",
    knownData: {
      aliases: ["Atlas Compute Campus"],
      operator: "Atlas Compute",
      city: "Morgantown",
      county: "Monongalia County",
      state: "WV",
    },
  }), true,
  "the operator immediately before the matched facility name establishes attribution at the matching location");
});

function responseRecorder() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body ?? "";
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

async function completeOfflineAuditResponse(auditRepository) {
  const response = Object.assign(new EventEmitter(), responseRecorder());
  response.writableEnded = false;
  response.writableFinished = false;
  let markEnded;
  const ended = new Promise((resolve) => { markEnded = resolve; });
  response.end = function end(body) {
    this.body = body ?? "";
    this.writableEnded = true;
    markEnded();
  };
  const pending = handleResearchProjectRequest(request({
    name: "Audit Finalization Fixture",
    location: "Texas",
    forceRefresh: true,
  }), response, {
    apiKey: null,
    googleApiKey: null,
    fetchImpl: async () => { throw new Error("No provider request is expected."); },
    cache: createResearchProjectCache(),
    auditRepository,
  });
  await ended;
  await pending;
  response.writableFinished = true;
  response.emit("finish");
  return response;
}

function request(body, method = "POST") {
  return { method, body, ip: "198.51.100.20" };
}

function validResearchResponse() {
  return {
    projectSummary: {
      name: "Project Atlas",
      location: "Taylor County, Texas",
      description: "High-level public research covering equipment lead times, local rates, noise, moratoriums, and semiconductor supply.",
      capacityMW: 600,
    },
    evidence: RESEARCH_EVIDENCE_IDS.map((id, index) => ({
      id,
      label: id.replaceAll("_", " "),
      value: index === 0 ? 42 : "Not disclosed",
      unit: index === 0 ? "$/MWh" : "Project context",
      classification: index % 2 === 0 ? "Missing Evidence" : "Management Assertion",
      citation: "Public source searched for Project Atlas (2026): https://example.com/atlas/source",
      description: "The public record does not establish a facility-level value.",
      sourceRole: "AI-researched public-source review",
      sourceUrls: index === 1 ? ["https://example.com/atlas/source"] : [],
      conflictSummary: null,
      coverageStatus: index === 1 ? "supported" : "searched-no-support",
      modelReportedConfidence: index === 0 ? 74 : null,
      ...(index === 1 ? { sourceUrl: "https://example.com/atlas/source" } : {}),
      ...(index === 0 ? { numericValue: 42 } : {}),
      claimPassage: "A public source excerpt about Project Atlas in Taylor County, Texas reports 42 and 365 and behind-the-meter generation.",
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      claimTimePeriod: "2026",
      ...(id === "site_hazard_exposure" ? { qualitativeValue: "high" } : {}),
      ...(id === "water_source_resilience" ? { qualitativeValue: "single-source" } : {}),
    })),
  };
}

const retrievedSource = {
  url: "https://example.com/atlas/source",
  title: "Project Atlas public filing",
  date: "2026-06-01",
  excerpt: "A public source excerpt about Project Atlas in Taylor County, Texas reports 42 and 365 and behind-the-meter generation.",
  claimPassage: "A public source excerpt about Project Atlas in Taylor County, Texas reports 42 and 365 and behind-the-meter generation.",
  claimSupport: RESEARCH_EVIDENCE_IDS.map((evidenceId) => ({
    evidenceId,
    values: evidenceId === "electricity_cost" ? [42, "Not disclosed"]
      : evidenceId === "grid_interconnection" ? [365, "Not disclosed"]
        : ["Not disclosed"],
  })),
  facilityScope: "exact-project",
  phaseScope: "exact-phase",
  timePeriod: "2026",
};

function withRetrievedPassage(source, passage = source?.excerpt ?? source?.claimPassage, physicalOpenIndex = 1) {
  return {
    ...source,
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      passage,
      physicalOpenIndex,
    },
  };
}

function singleCallResponse(research = validResearchResponse(), sources = [retrievedSource]) {
  return new Response(JSON.stringify({
    output: [
      { type: "web_search_call", action: { sources } },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify(research),
          annotations: sources.map((source) => ({
            type: "url_citation",
            url: source.url,
            title: source.title,
          })),
        }],
      },
    ],
  }), { status: 200 });
}

function categoryMappedResearch(evidenceId, sourceUrl, value = 42) {
  const research = validResearchResponse();
  const item = research.evidence.find((candidate) => candidate.id === evidenceId);
  Object.assign(item, {
    value,
    numericValue: value,
    unit: evidenceId === "grid_interconnection" ? "days" : evidenceId === "electricity_cost" ? "$/MWh" : "Mgal/year",
    classification: "Management Assertion",
    sourceUrl,
    sourceUrls: [sourceUrl],
    coverageStatus: "supported",
    claimPassage: "Project Atlas filing reports the project-specific value.",
    description: "The filing reports a project-specific value.",
    claimTimePeriod: "2026",
  });
  return research;
}

function categorySource(url, accessState = "accessible") {
  return {
    ...retrievedSource,
    url,
    title: "Project Atlas category filing",
    excerpt: "Project Atlas filing reports the project-specific value.",
    claimPassage: "Project Atlas filing reports the project-specific value.",
    claimSupport: [{ evidenceId: "electricity_cost", values: [42] }],
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    timePeriod: "2026",
    accessOutcome: {
      state: accessState,
      passage: accessState === "accessible" ? "Project Atlas filing reports the project-specific value." : null,
    },
  };
}

function compressedTextPdf(text) {
  const stream = deflateSync(Buffer.from(`BT /F1 12 Tf 72 720 Td (${text}) Tj ET\n`));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from("\nendstream")]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`));
    chunks.push(Buffer.isBuffer(objects[index]) ? objects[index] : Buffer.from(objects[index]));
    chunks.push(Buffer.from("\nendobj\n"));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  chunks.push(Buffer.from(offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")));
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

const substantiveHtmlPassage = [
  "The county filing describes a data center campus and the planned infrastructure work.",
  "The applicant submitted an interconnection request, a construction schedule, and a capacity estimate.",
  "Public comments address local services, land use, equipment deliveries, and the timing of utility upgrades.",
  "The record identifies the reviewing agencies and summarizes the next steps before construction can begin.",
].join(" ");

function htmlDocumentResponse(body) {
  return new Response(`<html><body><main><article><h1>Public project record</h1><p>${body}</p></article></main></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function substantiveHtmlResponse(body, url = "offline-fixture") {
  const digest = createHash("sha256").update(`${url}\0${body}`).digest("hex");
  const distinctRecordDetails = Array.from({ length: 16 }, (_, index) =>
    `record${digest.slice(index * 4, index * 4 + 4)} agency${digest.slice(63 - index * 4, 67 - index * 4)} section${index + 1}`)
    .join(". ");
  return htmlDocumentResponse(`${body} ${substantiveHtmlPassage} ${distinctRecordDetails}`);
}

test("reserves fifteen seconds between the server and browser deadlines", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 75_000);
});

test("excludes old saved CivicEngage and corrupted passages before structured analysis without changing receipts", () => {
  const unusablePassages = [
    redOakQualityFixtures.civicEngagePassage,
    redOakQualityFixtures.corruptedPdfPassage,
    "Verify you are human. Complete the security check before continuing.",
    "Enable JavaScript and cookies to continue.",
    "Sign in to continue reading.",
    "Home Projects News Contact Privacy Terms About Us",
    "Loading... Please wait.",
  ];
  const receipts = unusablePassages.map((passage, index) => ({
    url: `https://records.example.gov/source-${index}`,
    accessOutcome: { state: "accessible", reason: "retrieved", passage },
  }));
  receipts.push(
    {
      url: "https://records.example.gov/short-legitimate",
      accessOutcome: { state: "accessible", reason: "retrieved", passage: "Project Atlas proposes a new water plan." },
    },
    {
      url: "https://records.example.gov/project",
      accessOutcome: { state: "accessible", reason: "retrieved", passage: "A captured project passage with supported public-record facts." },
    },
  );
  const before = structuredClone(receipts);
  assert.deepEqual(selectResearchPassagesForStructuredAnalysis(receipts), receipts.slice(-2));
  assert.deepEqual(receipts, before, "quality filtering must not mutate immutable access receipts");
});

test("offline replay uses production selection and token fitting but never issues or stores a provider request body", () => {
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    operator: "DataBank",
    knownData: {
      operator: "DataBank",
      city: "Red Oak",
      county: "Ellis County",
      state: "Texas",
      capacity: 480,
    },
  };
  const category = buildResearchCategoryPlan(project).categories
    .find((candidate) => candidate.categoryId === "project-identity");
  const passage = "DataBank's Red Oak Campus is located in Red Oak, Texas.";
  const replay = replayResearchCategoryPassageInput(project, {
    ...category,
    runCorrelationId: "offline-replay-test",
    attempt: "primary",
  }, [{
    sourceId: "red-oak-source",
    occurrenceId: "red-oak-occurrence",
    url: "https://records.example/red-oak?token=opaque-token-value",
    canonicalUrl: "https://records.example/red-oak",
    sourceFamily: "primary-company",
    accessOutcome: { state: "accessible", passage },
  }]);

  assert.equal(replay.state, "prepared-but-not-issued");
  assert.equal(replay.issuedPassageCount, 0);
  assert.equal(replay.candidateCount, 1);
  assert.equal(replay.suppliedCount, 1);
  assert.equal(replay.decisions[0].identityAdmission.state, "passed");
  assert.equal(replay.decisions[0].finalSupplied.length, passage.length);
  assert.match(replay.decisions[0].finalSupplied.sha256, /^[a-f0-9]{64}$/);
  assert.equal(replay.inputSnapshot.sourceIds[0].sourceUrl, "https://records.example/red-oak");
  assert.equal(JSON.stringify(replay.inputSnapshot).includes(passage), false);
  assert.equal(JSON.stringify(replay.inputSnapshot).includes("opaque-token-value"), false);
  assert.match(replay.inputSnapshot.requestBodySha256, /^[a-f0-9]{64}$/);
});

test("replays the 11 exact-hash-verified captured passages through production identity admission", () => {
  const captureHtml = readFileSync(
    new URL("../../../attached_assets/reports/safeloc-multi-project-engine-validation-final.html", import.meta.url),
    "utf8",
  );
  const encodedBundle = captureHtml.match(
    /<script type="application\/octet-stream" id="audit-data">([\s\S]*?)<\/script>/i,
  )?.[1]?.trim();
  assert.ok(encodedBundle, "the retained evidence-conversion capture must be available");
  const bundle = JSON.parse(gunzipSync(Buffer.from(encodedBundle, "base64")).toString("utf8"));
  const runs = bundle.reportData?.runs ?? [];
  const available = [
    {
      sha256: "5c3d8f3de1a44ad51836f98d71b243b17b0037529e3237360494e96d30018ea4",
      length: 1985,
      url: "https://www.buttscountyida.com/",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "Navigation token Explore was attributed as owner/operator; Home/Explore headings became location conflicts.",
      after: "ambiguous",
    },
    {
      sha256: "76f22a011a8e5ecd88cd1f6eb27f3efc856e1cef9350cb947c523a5a56874257",
      length: 867,
      url: "https://www.aboutamazon.com/news/aws/aws-investment-georgia-ai-cloud-infrastructure",
      before: "ambiguous",
      beforeAdmission: "identity-not-established",
      beforeReason: "No requested-name or alias match; Georgia was the only location match.",
      after: "ambiguous",
    },
    {
      sha256: "70ade4d7d8d1f5e8f25ade8d64a802ffe5c197b5f129753fa12d126199e76339",
      length: 1827,
      url: "https://dcatlas.io/en/explore/facilities/aws-gregory-road-data-center",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "Announcement was attributed as an owner/operator and directory text supplied unrelated location conflicts.",
      after: "ambiguous",
    },
    {
      sha256: "ed2bbcf4e1d45b5128da5f8ba5ebd32e9a88af6065646774e27fdff071f14db5",
      length: 2751,
      url: "https://barnesville.com/amazon-exploring-data-center-locations-on-huge-tract-it-bought-here-in-largest-real-estate-transaction-in-county-history",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "Unrelated Douglas County evidence conflicted with the requested Butts County project.",
      after: "ambiguous",
    },
    {
      sha256: "96ea2e379a9f64a9d617453a7c9acd9d6f915e60eee006e45811e2212985292b",
      length: 1856,
      url: "https://w.media/aws-plans-new-data-center-in-georgia-usa",
      before: "ambiguous",
      beforeAdmission: "identity-not-established",
      beforeReason: "AWS was attributed as owner/operator, but the resolver did not establish the requested project/operator link.",
      after: "ambiguous",
    },
    {
      sha256: "48f2c2ac28a4d45631033d3e075864675cefc86ac79952c7de16b41da4bddd11",
      length: 4000,
      url: "https://northwiseproject.com/research/iren-sweetwater-site",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "Northwise byline text and GW were attributed as owner/operator, creating an operator conflict.",
      after: "ambiguous",
    },
    {
      sha256: "5e7c0adba59cc232ac20f38218c66db99612f8d0059fb42b967b1e5e3ffe79c7",
      length: 4000,
      url: "https://www.electricchoice.com/datacenters/texas",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "No requested-name or alias match; unrelated Texas-wide county entries created location conflicts.",
      after: "unrelated",
    },
    {
      sha256: "1c1ac3e09e7be4aabf5ce24f9dee0e1be2b017cd52d07c1b04fe3f0e2ac2d5e6",
      length: 2772,
      url: "https://w.media/iren-granted-conditional-base-load-status-for-2-gw-texas-campus",
      before: "ambiguous",
      beforeAdmission: "identity-not-established",
      beforeReason: "ERCOT's grid-operator role was attributed as project owner/operator.",
      after: "ambiguous",
    },
    {
      sha256: "ae69bd1ace1663c463a6441f68a15ba0c9fe9b3968755f6ac695a2b054e3abe0",
      length: 3546,
      url: "https://www.corgan.com/projects/vantage-az1-data-center-campus",
      before: "ambiguous",
      beforeAdmission: "identity-not-established",
      beforeReason: "Corgan navigation was already rejected; Project Stats Location Goodyear was recorded as a location conflict.",
      after: "ambiguous",
    },
    {
      sha256: "446beeee1bb7524c3c760bac6c73b37031f4b42bd0d8067c8a936e926e12551e",
      length: 4000,
      url: "https://www.interconnection.fyi/data-center/project/vantage-data-centers-az2-69904f45",
      before: "unrelated",
      beforeAdmission: "explicit-identity-conflict",
      beforeReason: "AZ2 directory/address/index actors and unrelated geography produced dozens of conflict signals.",
      after: "ambiguous",
    },
    {
      sha256: "c354987dc9c8c8aef30cc92039a1d83945b4cc1c94b3c574926803e39f763bd7",
      length: 4000,
      url: "https://atriumdata.ai/the-first-print/maricopa-data-center-lending",
      before: "ambiguous",
      beforeAdmission: "identity-not-established",
      beforeReason: "Data Center Dynamics was parsed as a city and Texas produced an unrelated location conflict.",
      after: "ambiguous",
    },
  ];
  const unavailable = [
    {
      sha256: "21411d0d0722273914950215829bf06a5bdd49d3469ae60f09bf2457addddfd1",
      length: 2760,
    },
    {
      sha256: "5ebcc3a738b07e7f60b9bf05e7aa1e20f7bce73b590cfd2a84c15c48c5a050dc",
      length: 4000,
    },
    {
      sha256: "5b4cc2766a18c95304f145cda6a1105ae015d1692d86fcbb074486daa3b26ce4",
      length: 2669,
    },
  ];
  const identityRuns = runs.filter((run) => run.phase === "identity-confirmation");
  const replayed = [];

  for (const expected of available) {
    assert.equal(expected.sha256.length, 64);
    let selected = null;
    for (const run of identityRuns) {
      for (const receipt of run.sourceReceipts ?? []) {
        const passage = receipt.passage;
        if (receipt.passageSha256 === expected.sha256 && typeof passage === "string" && passage) {
          selected = { run, receipt, passage };
        }
      }
    }
    assert.ok(selected, `exact captured passage ${expected.sha256} must remain replayable`);
    const { run, receipt, passage } = selected;
    assert.equal(createHash("sha256").update(passage).digest("hex"), expected.sha256);
    assert.equal(passage.length, expected.length);
    assert.equal(receipt.source?.canonicalUrl ?? receipt.source?.url, expected.url);

    const project = {
      projectId: run.projectId,
      name: run.projectName,
      operator: run.operator,
      location: run.location,
    };
    const source = {
      sourceId: `${run.runId}:${expected.sha256}`,
      occurrenceId: `${run.runId}:${expected.sha256}`,
      originalUrl: expected.url,
      url: expected.url,
      canonicalUrl: expected.url,
      sourceFamily: receipt.source?.sourceFamily ?? "other",
      accessOutcome: { state: "accessible", passage },
    };
    const categories = buildResearchCategoryPlan(project).categories;
    assert.equal(categories.length, 8, `${project.name} must use all eight production categories`);
    const categoryOutcomes = [];

    for (const category of categories) {
      const replay = replayResearchCategoryPassageInput(project, category, [source]);
      assert.equal(replay.state, "prepared-but-not-issued");
      assert.equal(replay.candidateCount, 1);
      assert.equal(replay.issuedPassageCount, 0);
      assert.equal(replay.suppliedCount, 0, `${expected.sha256} must not reach analysis`);
      assert.equal(replay.decisions.length, 1);
      const decision = replay.decisions[0];
      assert.equal(decision.identityAdmission.verdict, expected.after, expected.url);
      assert.equal(decision.included, false, expected.url);
      assert.equal(decision.decision, "excluded-before-deduplication", expected.url);
      assert.equal(decision.finalSupplied.sha256, null, expected.url);
      assert.equal(
        decision.reasonCode,
        expected.after === "unrelated" ? "explicit-identity-conflict" : "identity-not-established",
        expected.url,
      );
      categoryOutcomes.push({
        verdict: decision.identityAdmission.verdict,
        reasonCode: decision.reasonCode,
        reason: decision.identityAdmission.reason,
        routeReason: decision.routeReason,
      });

      const trace = decision.identityAdmission.trace;
      assert.ok(trace, "production admission must retain the resolver trace");
      const attributedActors = trace.actors.filter((actor) =>
        actor.admittedAsOperator === true).map((actor) => actor.actor.toLowerCase());
      if (expected.sha256 === "5c3d8f3de1a44ad51836f98d71b243b17b0037529e3237360494e96d30018ea4") {
        assert.equal(attributedActors.some((actor) => actor === "explore"), false);
      }
      if (expected.sha256 === "70ade4d7d8d1f5e8f25ade8d64a802ffe5c197b5f129753fa12d126199e76339") {
        assert.equal(attributedActors.some((actor) => actor === "announcement"), false);
      }
      if (expected.sha256 === "48f2c2ac28a4d45631033d3e075864675cefc86ac79952c7de16b41da4bddd11") {
        assert.equal(attributedActors.some((actor) => /northwise|\bgw\b/.test(actor)), false);
      }
      if (expected.sha256 === "1c1ac3e09e7be4aabf5ce24f9dee0e1be2b017cd52d07c1b04fe3f0e2ac2d5e6") {
        assert.equal(attributedActors.some((actor) => actor === "ercot"), false);
      }
      if (expected.sha256 === "446beeee1bb7524c3c760bac6c73b37031f4b42bd0d8067c8a936e926e12551e") {
        assert.equal(attributedActors.some((actor) => /alberta electric|vantage data centers/i.test(actor)), false);
        assert.equal(trace.secondaryReasons.some((reason) => /location-conflict/.test(reason)), false);
      }
    }
    assert.equal(new Set(categoryOutcomes.map((outcome) => outcome.verdict)).size, 1);
    assert.equal(new Set(categoryOutcomes.map((outcome) => outcome.reasonCode)).size, 1);
    assert.equal(new Set(categoryOutcomes.map((outcome) => outcome.reason)).size, 1);
    replayed.push({ ...expected, project: project.name, reason: categoryOutcomes[0].reason });
  }

  for (const missing of unavailable) {
    assert.equal(
      identityRuns.some((run) => (run.sourceReceipts ?? []).some((receipt) => {
        const passage = receipt.passage;
        return typeof passage === "string"
          && passage.length === missing.length
          && createHash("sha256").update(passage).digest("hex") === missing.sha256;
      })),
      false,
      `unavailable body ${missing.sha256} must not be reconstructed`,
    );
  }
  assert.equal(replayed.length, 11);
});

test("grounded orchestration does not issue a structured prompt when document access yields the retained CivicEngage error page", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/research-partial-receipts.json", import.meta.url),
    "utf8",
  ));
  const { passage: _existingPassage, ...candidateBase } = fixture.accessibleReceipt;
  const candidate = {
    ...candidateBase,
    excerpt: redOakQualityFixtures.civicEngagePassage,
    categoryIds: ["water"],
  };
  let structuredProviderCalls = 0;
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    allowGoogleFallback: false,
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    documentFetchImpl: async (url) => new Response(
      `<html><body><main><h1>Ellis County Archive</h1><p>${redOakQualityFixtures.civicEngagePassage}</p></main></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    ),
    fetchImpl: async () => {
      structuredProviderCalls += 1;
      throw new Error("The structured provider must not be called for an unusable retained passage.");
    },
  });

  const receipt = result.sourceLedger.find((source) => source.originalUrl === candidate.url);
  assert.equal(structuredProviderCalls, 0);
  assert.equal(receipt?.accessOutcome.state, "blocked-or-shell");
  assert.equal(receipt?.accessOutcome.reason, "application-error-page");
  assert.equal(receipt?.accessOutcome.passage, null);
  assert.ok(result.researchAudit.providerLimitations.some((limitation) =>
    /no usable retained Google-grounded passage/i.test(limitation)));
});

test("schedules protected source opportunities before generic context and reuses failed canonical receipts", () => {
  const scheduler = createPhysicalOpenScheduler({ maxPhysicalOpens: 24 });
  assert.equal(PROTECTED_SOURCE_OPPORTUNITIES.length, 9);
  const first = scheduler.authorize({
    categoryId: "project-identity",
    canonicalUrl: "https://developer.example/disclosure?utm_source=search",
    source: { sourceChannel: "declared-company-domain" },
  });
  assert.equal(first.allowed, true);
  assert.equal(first.physicalOpenIndex, 1);
  const reused = scheduler.authorize({
    categoryId: "water",
    canonicalUrl: "https://developer.example/disclosure",
    source: { sourceChannel: "declared-company-domain" },
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.physicalOpenIndex, 1);
  const deferred = scheduler.authorize({
    categoryId: "project-identity",
    canonicalUrl: "https://developer.example/context",
    source: { sourceChannel: "provider" },
  });
  assert.equal(deferred.allowed, true);
  assert.equal(deferred.physicalOpenIndex, 2);
  const roles = [
    ["construction-capital", "https://developer.example/company"],
    ["construction-capital", "https://developer.example/permit"],
    ["permitting-community", "https://county.example/authority"],
    ["permitting-community", "https://county.example/community"],
    ["grid", "https://grid.example/record"],
    ["water", "https://water.example/record"],
    ["tenant-counterparty", "https://tenant.example/record"],
    ["climate-operational-hazard", "https://climate.example/record"],
  ];
  for (const [categoryId, url] of roles) {
    assert.equal(scheduler.authorize({
      categoryId,
      canonicalUrl: url,
      source: { sourceChannel: "provider" },
    }).allowed, true);
  }
  const generic = scheduler.authorize({
    categoryId: "project-identity",
    canonicalUrl: "https://developer.example/context",
    source: { sourceChannel: "provider" },
  });
  assert.equal(generic.allowed, true);
  assert.equal(scheduler.used, 10);
});

test("builds an auditable eight-category plan without changing the 16 identifiers", () => {
  const plan = buildResearchCategoryPlan({ name: "Atlas", location: "Taylor County, Texas" });
  assert.equal(plan.categories.length, 8);
  assert.deepEqual(plan.categories.map((category) => category.categoryId), [
    "project-identity",
    "grid",
    "electricity",
    "water",
    "permitting-community",
    "construction-capital",
    "tenant-counterparty",
    "climate-operational-hazard",
  ]);
  assert.equal(new Set(plan.categories.map((category) => category.requestedPrimaryQuery)).size, 8);
  assert.equal(plan.budget.maxFollowUps, 8);
});

test("targets the unresolved evidence item in a category follow-up", () => {
  const water = buildResearchCategoryPlan({ name: "Atlas", location: "Taylor County, Texas" }).categories
    .find((category) => category.categoryId === "water");
  const followUp = buildCategoryFollowUpQuery(
    { name: "Atlas", location: "Taylor County, Texas" },
    water,
    ["water_rights"],
  );
  assert.match(followUp, /water right|groundwater withdrawal authorization/i);
  assert.doesNotMatch(followUp, /water demand consumption gallons usage/i);
});

test("identity follow-up accepts planned category shape without looking up a financial variable", () => {
  for (const location of ["Sweetwater, Texas", "Jackson, Georgia", "Goodyear, Arizona"]) {
    const project = { name: "Cedar Campus", location, knownData: { operator: "Cedar Compute" } };
    const identity = buildResearchCategoryPlan(project).categories.find(category => category.categoryId === "project-identity");
    const query = buildCategoryFollowUpQuery(project, identity, ["project-identity"]);
    assert.match(query, /Cedar Campus/);
    assert.match(query, /Cedar Compute/);
    assert.doesNotMatch(query, /undefined|electricity price|water demand/i);
  }
});

test("separates authoritative Texas queries from an unrestricted exact-project fallback", () => {
  const project = {
    name: "Project Kilby",
    location: "Abilene, Taylor County, Texas",
    knownData: {
      city: "Abilene",
      county: "Taylor",
      state: "Texas",
      authorityDomains: ["abilenetx.gov", "taylorcountytexas.org"],
      companyDomains: ["microsoft.com"],
      operator: "Microsoft",
    },
  };
  const plan = buildResearchCategoryPlan(project);
  const water = plan.categories.find((category) => category.categoryId === "water");
  const permitting = plan.categories.find((category) => category.categoryId === "permitting-community");
  const construction = plan.categories.find((category) => category.categoryId === "construction-capital");
  const tenant = plan.categories.find((category) => category.categoryId === "tenant-counterparty");
  assert.match(water.requestedPrimaryQuery, /site:abilenetx\.gov|site:taylorcountytexas\.org/);
  assert.match(permitting.requestedPrimaryQuery, /"City of Abilene"|"Taylor County"/);
  assert.match(construction.requestedPrimaryQuery, /site:sec\.gov/);
  assert.match(construction.requestedPrimaryQuery, /site:microsoft\.com/);
  assert.match(tenant.requestedPrimaryQuery, /site:sec\.gov/);
  assert.match(tenant.requestedPrimaryQuery, /site:microsoft\.com/);
  for (const category of [water, permitting, construction, tenant]) {
    assert.doesNotMatch(category.optionalFollowUpQuery, /\bsite:/i);
    assert.doesNotMatch(category.optionalFollowUpQuery, /broader web fallback/i);
    assert.match(category.optionalFollowUpQuery, /Project Kilby/);
  }
  assert.equal(water.authorityTargets.localAuthorities[0].status, "established");
  const unresolvedLocation = buildResearchCategoryPlan({ name: "Project Rainier", location: "Texas" }).categories.find((category) => category.categoryId === "water");
  assert.ok(unresolvedLocation.authorityTargets.limitations.length > 0);
});

test("routes Arizona and Ohio through state authorities without borrowing ERCOT evidence", () => {
  for (const [location, domains] of [
    ["Phoenix, Arizona", ["azcc.gov", "azwater.gov", "azdeq.gov"]],
    ["Columbus, Ohio", ["puco.ohio.gov", "ohiodnr.gov", "epa.ohio.gov"]],
  ]) {
    const plan = buildResearchCategoryPlan({
      name: "Project Atlas",
      location,
      knownData: { operator: "Atlas Compute", companyDomains: ["atlas.example"] },
    });
    const water = plan.categories.find((category) => category.categoryId === "water");
    assert.ok(domains.every((domain) => water.requestedPrimaryQuery.includes(`site:${domain}`)));
    assert.match(water.requestedPrimaryQuery, /official government regulator utility record/i);
    assert.doesNotMatch(water.requestedPrimaryQuery, /ERCOT/i);
    assert.match(plan.categories.find((category) => category.categoryId === "construction-capital").requestedPrimaryQuery, /site:atlas\.example/);
  }
});

test("keeps generic-state authority routing explicit when domains are unknown", () => {
  const plan = buildResearchCategoryPlan({
    name: "Project Atlas",
    location: "Sacramento, California",
    knownData: { operator: "Atlas Compute", companyDomains: ["atlas.example"] },
  });
  const water = plan.categories.find((category) => category.categoryId === "water");
  assert.ok(water.authorityTargets.localAuthorities.some((authority) =>
    authority.name === "California utility regulator"
      && authority.status === "identified-no-domain"
      && authority.domain === null,
  ));
  assert.match(water.authorityTargets.limitations.join(" "), /official domains were not established/i);
  assert.doesNotMatch(water.requestedPrimaryQuery, /site:ercot\.com/i);
});

test("quarantines ERCOT records when the project is in Arizona or Ohio", () => {
  const body = validResearchResponse();
  const item = body.evidence.find((candidate) => candidate.id === "grid_interconnection");
  item.sourceUrl = "https://www.ercot.com/gridinfo/atlas";
  item.sourceUrls = [item.sourceUrl];
  item.coverageStatus = "supported";
  item.value = "365 days";
  item.numericValue = 365;
  item.claimPassage = "Project Atlas interconnection study is 365 days.";
  const parsed = parseResearchResponse(
    { ...body, projectSummary: { ...body.projectSummary, location: "Phoenix, Arizona" } },
    [{
      url: item.sourceUrl,
      title: "ERCOT interconnection record",
      excerpt: item.claimPassage,
      sourceClass: "primary-government",
      exactProject: true,
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    }],
  );
  const grid = parsed.evidence.find((candidate) => candidate.id === "grid_interconnection");
  assert.notEqual(grid.sourceRelevance, "exact-project");
  assert.equal(grid.eligibleForModel, false);
});

test("retains identity aliases and surfaces campus-versus-region ambiguity before claims", () => {
  const identity = buildProjectIdentityContext({
    name: "Atlas",
    location: "Phoenix metro region, Arizona",
    knownData: { aliases: ["Atlas Campus"], operator: "Atlas Compute" },
  });
  assert.deepEqual(identity.aliases, ["Atlas Campus", "Atlas Compute"]);
  assert.ok(identity.ambiguities.some((message) => /campus-versus-region/i.test(message)));
  const identityCategory = buildResearchCategoryPlan({
    name: "Atlas",
    location: "Phoenix metro region, Arizona",
    knownData: { aliases: ["Atlas Campus"], operator: "Atlas Compute" },
  }).categories.find((category) => category.categoryId === "project-identity");
  assert.ok(identityCategory.authorityTargets.limitations.some((message) => /campus-versus-region/i.test(message)));
});

test("reserves primary opportunities before consuming shared follow-up requests", async () => {
  const attempts = [];
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Arizona" },
    {
      concurrent: false,
      budget: {
        ...RESEARCH_RUN_BUDGET,
        maxProviderRequests: 8,
        maxFollowUps: 8,
      },
      retrieveCategory: async ({ categoryId, attempt }) => {
        attempts.push(`${categoryId}:${attempt}`);
        return { candidates: [], gapDrivenFollowUp: true, observedQueries: [`${categoryId} ${attempt}`] };
      },
    },
  );
  assert.equal(attempts.length, 8);
  assert.ok(attempts.every((attempt) => attempt.endsWith(":primary")));
  assert.equal(run.followUps, 0);
  assert.equal(run.providerRequests, 8);
});

test("does not mark an empty primary or empty follow-up as successful", async () => {
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Arizona" },
    {
      retrieveCategory: async () => ({ candidates: [], gapDrivenFollowUp: true }),
    },
  );
  assert.ok(Object.values(run.categoryExecutions).every((execution) => execution.state !== "Complete"));
});

test("rejects unsafe, blocked, scanned, and unsupported documents explicitly", () => {
  assert.equal(evaluateResearchDocumentAccess({ url: "javascript:alert(1)" }).reason, "unsafe-url");
  assert.equal(evaluateResearchDocumentAccess({ url: "https://example.gov/report.pdf", contentType: "application/pdf", accessStatus: "open", scanned: true }).state, "accessible");
  assert.equal(evaluateResearchDocumentAccess({ url: "https://example.gov/report.zip", contentType: "application/zip", accessStatus: "open" }).reason, "unsupported-source-type");
  const pdf = evaluateResearchDocumentAccess({
    url: "https://example.gov/report.pdf?utm_source=test&id=7",
    contentType: "application/pdf",
    accessStatus: "open",
    passage: "Project Atlas record.",
    page: 4,
  });
  assert.equal(pdf.state, "accessible");
  assert.equal(pdf.format, "text-pdf");
  assert.equal(pdf.canonicalUrl, "https://example.gov/report.pdf?id=7");
  assert.equal(pdf.pageOrSection, 4);
});

test("reads bounded HTML and text PDFs while recording retrieval limitations", async () => {
  const html = await accessResearchDocument({ url: "https://example.gov/atlas", accessStatus: "open" }, {
    fetchImpl: async () => htmlDocumentResponse(`Project Atlas Permit record. ${substantiveHtmlPassage}`),
    now: () => "2026-09-08T12:00:00.000Z",
  });
  assert.equal(html.state, "accessible");
  assert.match(html.passage, /Project Atlas Permit record/);
  assert.equal(html.extractionMethod, "html");
  assert.match(html.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(html.retrievalTime, "2026-09-08T12:00:00.000Z");
  const pdf = await accessResearchDocument({ url: "https://example.gov/atlas.pdf", accessStatus: "open" }, {
    fetchImpl: async () => new Response(compressedTextPdf("Project Atlas permit record."), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
  });
  assert.equal(pdf.state, "accessible");
  assert.equal(pdf.format, "text-pdf");
  assert.match(pdf.passage, /Project Atlas permit record/);
  assert.match(pdf.extractionLimitations.join(" "), /Page references/);
  const json = await accessResearchDocument({ url: "https://example.gov/atlas.json", accessStatus: "open" }, {
    fetchImpl: async () => new Response(JSON.stringify({ project: "Project Atlas", owner: "Atlas Holdings" }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  });
  assert.equal(json.state, "accessible");
  assert.equal(json.format, "json");
  assert.equal(json.extractionMethod, "json");
  assert.match(json.passage, /Project Atlas/);
  const xml = await accessResearchDocument({ url: "https://example.gov/atlas.xml", accessStatus: "open" }, {
    fetchImpl: async () => new Response("<project><name>Project Atlas</name><permit>Approved</permit></project>", {
      status: 200,
      headers: { "content-type": "application/xml" },
    }),
  });
  assert.equal(xml.state, "accessible");
  assert.equal(xml.format, "xml");
  assert.match(xml.passage, /Project Atlas Approved/);
});

test("rejects fetched verification walls and thin HTML with explicit access reasons", async () => {
  const cases = [
    ["<main><h1>Verify you are human</h1><p>Complete the security check before continuing.</p></main>", "blocked-or-shell", "bot-verification-page"],
    ["<main><p>Enable JavaScript and cookies to continue.</p></main>", "blocked-or-shell", "javascript-required-shell"],
    ["<main><h1>Sign in to continue reading</h1></main>", "blocked-or-shell", "login-or-paywall-shell"],
    ["<main><h1>Subscribe to continue reading</h1></main>", "blocked-or-shell", "login-or-paywall-shell"],
    ["<main><h1>Project Atlas</h1><p>Permit status: pending.</p></main>", "low-content", "genuine-prose-below-300-characters"],
  ];
  for (const [html, state, reason] of cases) {
    const result = await accessResearchDocument({ url: "https://example.gov/page", accessStatus: "open" }, {
      fetchImpl: async () => new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    });
    assert.equal(result.state, state);
    assert.equal(result.reason, reason);
    assert.equal(result.passage, null);
    assert.equal(result.fetchMetrics.responseStatus, 200);
  }
});

test("retains one article and rejects near-identical text from another URL on the same site", async () => {
  const tracker = new Map();
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return htmlDocumentResponse(substantiveHtmlPassage);
  };
  const first = await accessResearchDocument({ url: "https://www.records.example.gov/article/one", accessStatus: "open" }, {
    fetchImpl,
    siteBoilerplateTracker: tracker,
  });
  const repeated = await accessResearchDocument({ url: "https://records.example.gov/article/two", accessStatus: "open" }, {
    fetchImpl,
    siteBoilerplateTracker: tracker,
  });
  assert.equal(first.state, "accessible");
  assert.equal(repeated.state, "site-boilerplate");
  assert.equal(repeated.reason, "near-identical-article-already-retained-on-site");
  assert.equal(repeated.passage, null);
  const otherSite = await accessResearchDocument(
    { url: "https://other.example.gov/article/three", accessStatus: "open" },
    { fetchImpl, siteBoilerplateTracker: tracker },
  );
  assert.equal(otherSite.state, "accessible", "identical prose from another site is not same-site boilerplate");
  assert.equal(fetchCount, 3, "duplicate classification adds no request beyond one fetch per explicit candidate");
});

test("opens a public DataBank-style redirect with validated offline DNS and transport fixtures", async () => {
  const initialUrl = "https://grounding.fixture/citation";
  const finalUrl = "https://www.databank.com/resources/press-releases/databank-announces-development-of-480mw-data-center-campus-in-south-dallas/";
  const dnsCalls = [];
  const transportCalls = [];
  const addresses = {
    "grounding.fixture": { address: "93.184.216.34", family: 4 },
    "www.databank.com": { address: "93.184.216.35", family: 4 },
  };
  const result = await accessResearchDocument({ url: initialUrl, accessStatus: "open" }, {
    dnsLookup: async (hostname, options) => {
      dnsCalls.push({ hostname, options });
      return [addresses[hostname]];
    },
    transportImpl: async (url, _init, { address }) => {
      transportCalls.push({ url, address });
      const withDnsSummary = (response) => {
        Object.defineProperty(response, "dnsValidationTelemetry", {
          value: address.validationTelemetry,
        });
        return response;
      };
      if (url === initialUrl) {
        return withDnsSummary(new Response(null, {
          status: 302,
          headers: { location: finalUrl },
        }));
      }
      return withDnsSummary(new Response(
        `<html><body><main><article><h1>DataBank announces a 480 MW data center campus in South Dallas</h1><p>The public announcement describes the planned campus. ${substantiveHtmlPassage}</p></article></main></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ));
    },
  });

  assert.equal(result.state, "accessible");
  assert.equal(result.reason, "retrieved");
  assert.equal(result.canonicalUrl, "https://www.databank.com/resources/press-releases/databank-announces-development-of-480mw-data-center-campus-in-south-dallas");
  assert.match(result.passage, /480 MW data center campus/i);
  assert.deepEqual(dnsCalls.map(({ hostname }) => hostname), ["grounding.fixture", "www.databank.com"]);
  assert.ok(dnsCalls.every(({ options }) => options.all === true && options.verbatim === true));
  assert.deepEqual(transportCalls, [
    { url: initialUrl, address: { ...addresses["grounding.fixture"], validationTelemetry: { answerCount: 1, addressFamilies: [4], addressFamilyCounts: { ipv4: 1, ipv6: 0, other: 0 }, publicAnswerCount: 1, prohibitedAnswerCount: 0, rejectingRules: [] } } },
    { url: finalUrl, address: { ...addresses["www.databank.com"], validationTelemetry: { answerCount: 1, addressFamilies: [4], addressFamilyCounts: { ipv4: 1, ipv6: 0, other: 0 }, publicAnswerCount: 1, prohibitedAnswerCount: 0, rejectingRules: [] } } },
  ]);
  assert.deepEqual(result.transportDiagnostic.redirectChain, [
    finalUrl,
  ]);
  assert.ok(result.redirectHops.some((hop) => hop.status === 302));
  assert.equal(result.fetchMetrics.responseStatus, 200);
  assert.equal(result.fetchMetrics.contentType, "text/html");
  assert.ok(result.fetchMetrics.bytesRead > 0);
  assert.equal(result.fetchMetrics.dnsValidation.addressFamilyCounts.ipv4, 1);
});

test("blocks private and mixed-address redirect destinations before offline transport access", async () => {
  const initialUrl = "https://grounding.fixture/citation";
  let privateTransportCalls = 0;
  const privateResult = await accessResearchDocument({ url: initialUrl, accessStatus: "open" }, {
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    transportImpl: async () => {
      privateTransportCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin?token=secret" },
      });
    },
  });
  assert.equal(privateResult.state, "blocked");
  assert.equal(privateResult.reason, "private-destination");
  assert.equal(privateTransportCalls, 1);
  assert.equal(privateResult.transportDiagnostic.stage, "redirect-validation");
  assert.doesNotMatch(JSON.stringify(privateResult), /token=secret|127\.0\.0\.1/);

  let mixedTransportCalls = 0;
  const mixedResult = await accessResearchDocument({ url: initialUrl, accessStatus: "open" }, {
    dnsLookup: async (hostname) => hostname === "grounding.fixture"
      ? [{ address: "93.184.216.34", family: 4 }]
      : [
        { address: "93.184.216.35", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ],
    transportImpl: async (url) => {
      mixedTransportCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.databank.com/public" },
      });
    },
  });
  assert.equal(mixedResult.state, "blocked");
  assert.equal(mixedResult.reason, "private-destination");
  assert.equal(mixedResult.transportDiagnostic.stage, "dns-validation");
  assert.equal(mixedResult.transportDiagnostic.addressValidationReason, "prohibited-address-class");
  assert.deepEqual(mixedResult.transportDiagnostic.addressValidationTelemetry, {
    answerCount: 2,
    addressFamilies: [4],
    addressFamilyCounts: { ipv4: 2, ipv6: 0, other: 0 },
    publicAnswerCount: 1,
    prohibitedAnswerCount: 1,
    rejectingRules: ["ipv4-private-use"],
  });
  assert.equal(mixedResult.transportDiagnostic.addressValidationCategory, "dns-answer-policy");
  assert.equal(mixedResult.transportDiagnostic.addressValidationRule, "ipv4-private-use");
  assert.equal(mixedTransportCalls, 1);
});

test("replays a committed synthetic project-scope and rejected-DNS fixture offline", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-workflow-offline.json", import.meta.url), "utf8"));
  assert.equal(fixture.testOnly, true);
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.liveProviderPayloadsIncluded, false);
  assert.equal(fixture.historicalDataBankDiagnostic.rootCause, "unknown");
  assert.equal(fixture.historicalDataBankDiagnostic.smallestNonPaidRuntimeDiagnostic.providerRequests, 0);
  assert.match(fixture.documentAccess.retrievedPassage.passage, /168 MW of IT load/);
  assert.equal(fixture.documentAccess.retrievedPassage.applicability.buildingPhase, "Phase A, Buildings 1–3");
  assert.equal(fixture.unsupportedSummaryClaims.length, 2);
  assert.equal(fixture.providerFailures.length, 3);
  assert.ok(fixture.requestOutcomes.some((attempt) => attempt.outcome === "cancelled-before-issue"));
  assert.ok(fixture.requestOutcomes.some((attempt) => attempt.outcome === "cancelled-after-issue"));

  let transportCalls = 0;
  const result = await accessResearchDocument({
    url: fixture.documentAccess.candidate.url,
    accessStatus: "open",
  }, {
    dnsLookup: async () => [
      { address: "93.184.216.35", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ],
    transportImpl: async () => {
      transportCalls += 1;
      return new Response("<html>must not be fetched</html>", {
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, fixture.documentAccess.candidate.expectedReason);
  assert.equal(result.transportDiagnostic.addressValidationReason,
    fixture.documentAccess.candidate.expectedValidationReason);
  assert.equal(result.transportDiagnostic.addressValidationCategory, fixture.documentAccess.candidate.expectedCategory);
  assert.equal(result.transportDiagnostic.addressValidationRule, fixture.documentAccess.candidate.expectedRejectingRule);
  assert.deepEqual(result.transportDiagnostic.addressValidationTelemetry.addressFamilyCounts,
    fixture.documentAccess.candidate.expectedAnswerFamilyCounts);
  assert.equal(transportCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /93\.184\.216\.35|10\.0\.0\.7/);
  const audit = buildResearchAudit({
    project: { name: "Project Atlas", location: "Phoenix, Arizona" },
    sources: [{ ...fixture.documentAccess.candidate, categoryIds: ["water"], accessOutcome: result }],
  });
  assert.ok(audit.dnsRejections.some((entry) => entry.categoryId === "water"
    && entry.hostname === new URL(fixture.documentAccess.candidate.url).hostname
    && entry.rule === fixture.documentAccess.candidate.expectedRejectingRule));
  assert.doesNotMatch(JSON.stringify(audit.dnsRejections), /93\.184\.216\.35|10\.0\.0\.7/);
});

test("revalidates each redirect hop and blocks DNS rebinding without leaking resolver details", async () => {
  const url = "https://grounding.fixture/citation";
  let lookupCount = 0;
  let transportCalls = 0;
  const result = await accessResearchDocument({ url, accessStatus: "open" }, {
    dnsLookup: async () => {
      lookupCount += 1;
      return lookupCount === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];
    },
    transportImpl: async () => {
      transportCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: url },
      });
    },
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "private-destination");
  assert.equal(result.transportDiagnostic.stage, "dns-validation");
  assert.equal(result.transportDiagnostic.addressValidationReason, "prohibited-address-class");
  assert.equal(lookupCount, 2);
  assert.equal(transportCalls, 1);
  assert.doesNotMatch(JSON.stringify(result), /169\.254\.169\.254/);
});

test("keeps unsafe redirects distinct from bounded redirect limits", async () => {
  const result = await accessResearchDocument({ url: "https://grounding.fixture/citation", accessStatus: "open" }, {
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    transportImpl: async () => new Response(null, {
      status: 302,
      headers: { location: "javascript:alert(1)" },
    }),
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "unsafe-redirect");
  assert.equal(result.transportDiagnostic.stage, "redirect-validation");
  assert.doesNotMatch(JSON.stringify(result), /javascript:|alert/);
});

test("blocks DNS rebinding before a default outbound document request", async () => {
  const result = await accessResearchDocument({ url: "https://rebind.example.gov/atlas", accessStatus: "open" }, {
    dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "private-destination");
});

test("pins both single-address and all-address Node lookup requests", async () => {
  const lookup = createPinnedLookup({ address: "203.0.113.8", family: 4 });
  await new Promise((resolve, reject) => {
    lookup("example.gov", { all: false }, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, "203.0.113.8");
      assert.equal(family, 4);
      resolve();
    });
  });
  await new Promise((resolve, reject) => {
    lookup("example.gov", { all: true }, (error, addresses) => {
      if (error) return reject(error);
      assert.deepEqual(addresses, [{ address: "203.0.113.8", family: 4 }]);
      resolve();
    });
  });
});

test("preserves bounded sanitized document transport errors and cancellation state", async () => {
  const failed = await accessResearchDocument({ url: "https://example.gov/report?token=private-value" }, {
    fetchImpl: async () => {
      const cause = Object.assign(new Error("connect failed for https://example.gov/report?token=private-value"), {
        code: "ECONNREFUSED",
      });
      throw Object.assign(new TypeError("fetch failed authorization: Bearer sk-secret-value"), {
        code: "ERR_FETCH_FAILED",
        cause,
      });
    },
  });
  assert.equal(failed.reason, "network-failure");
  assert.equal(failed.transportDiagnostic.stage, "request");
  assert.equal(failed.transportDiagnostic.responseReceived, false);
  assert.equal(failed.transportDiagnostic.errorCode, "ERR_FETCH_FAILED");
  assert.equal(failed.transportDiagnostic.causeCode, "ECONNREFUSED");
  assert.equal(failed.transportDiagnostic.sourceOrigin, "https://example.gov");
  assert.equal(failed.transportDiagnostic.sourcePathname, "/report");
  assert.doesNotMatch(JSON.stringify(failed.transportDiagnostic), /private-value|sk-secret-value|Bearer\s+sk-/);

  const controller = new AbortController();
  const pending = accessResearchDocument({ url: "https://example.gov/slow" }, {
    signal: controller.signal,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }),
  });
  controller.abort(new DOMException("bounded timeout", "TimeoutError"));
  await assert.rejects(pending, (error) => {
    assert.equal(error.name, "ResearchCancelledError");
    assert.equal(error.transportDiagnostic.cancelled, true);
    assert.equal(error.transportDiagnostic.timedOut, true);
    return true;
  });
});

test("limits provider requests globally and records honest request telemetry", async () => {
  const gate = createResearchProviderGate({
    tokensPerMinute: 30_000,
    tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
  });
  let active = 0;
  let peak = 0;
  const fetchImpl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    const response = singleCallResponse(validResearchResponse());
    const body = await response.json();
    body.usage = { input_tokens: 120, output_tokens: 40, total_tokens: 160 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const calls = await Promise.all(Array.from({ length: 5 }, (_, index) => researchProjectWithWebSearch(
    { name: "Project Atlas", location: "Ohio" },
    "server-secret-for-test",
    fetchImpl,
    undefined,
    {
      categoryId: `category-${index}`,
      evidenceIds: ["electricity_cost"],
      attempt: index === 4 ? "repair" : "primary",
      maxToolCalls: 1,
    },
    gate,
  )));
  assert.equal(peak, 1);
  assert.equal(gate.snapshot().active, 0);
  assert.ok(calls.some((call) => call.coverage.providerAttempt.queueWaitMs > 0));
  assert.equal(calls[4].coverage.providerAttempt.attemptType, "repair");
  assert.equal(RESEARCH_CATEGORY_MAX_TOKENS, 3_500);
  assert.equal(calls[0].coverage.providerAttempt.requestedOutputTokens, RESEARCH_CATEGORY_MAX_TOKENS);
  assert.deepEqual(calls[0].coverage.providerUsage, {
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
  });
});

test("omits quantity and adjacent qualification sentences as one whole group under a tiny category input cap", async () => {
  const project = { name: "Project Atlas", location: "Taylor County, Texas" };
  const protectedSentences = [
    "The exact-project utility record reports a 365-day interconnection study duration for the first building.",
    "That 365-day duration is not approved and does not establish a firm energization date.",
    "It applies only to the proposed first building, not to every phase of the campus.",
  ];
  const neutralSentence = "This section contains general administrative context and descriptive public record material.";
  const passage = [
    neutralSentence,
    ...protectedSentences,
    neutralSentence,
    ...Array.from({ length: 80 }, () => neutralSentence),
  ].join(" ");
  const source = {
    occurrenceId: "atomic-grid-passage",
    url: "https://records.example.gov/atlas/atomic-grid-passage",
    originalUrl: "https://records.example.gov/atlas/atomic-grid-passage",
    canonicalUrl: "https://records.example.gov/atlas/atomic-grid-passage",
    title: "Project Atlas utility record",
    sourceChannel: "county-records",
    origin: "google-grounded-search",
    sourceClass: "primary-government",
    categoryIds: ["grid"],
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      passage,
      physicalOpenIndex: 1,
    },
  };
  const run = async (groundedSources) => {
    let requestBody;
    const result = await researchProjectWithWebSearch(
      project,
      "fixture-provider-token",
      async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return singleCallResponse(validResearchResponse(), []);
      },
      undefined,
      {
        categoryId: "grid",
        label: "Grid",
        query: "Project Atlas grid interconnection",
        evidenceIds: ["grid_interconnection"],
        webSearchEnabled: false,
        groundedSources,
      },
      createResearchProviderGate({
        tokensPerMinute: 30_000,
        tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
      }),
    );
    return { result, requestBody };
  };

  const baseline = await withResearchCategoryInputTokenCap(5_000, () => run([]));
  const baselineEstimate = baseline.result.coverage.categoryPromptTelemetry.estimatedInputTokens;
  const tinyInputCap = baselineEstimate + 40;
  const bounded = await withResearchCategoryInputTokenCap(tinyInputCap, () => run([source]));
  const userContent = bounded.requestBody.input.find((entry) => entry.role === "user").content;
  const presentSentences = protectedSentences.map((sentence) => userContent.includes(sentence));

  assert.deepEqual(presentSentences, [false, false, false],
    "the quantity, its negation, and its facility/phase scope must be omitted together when their complete context window cannot fit");
  assert.ok(protectedSentences.every((sentence) => !userContent.includes(sentence.slice(0, 44))),
    "an over-cap candidate must not leave a clipped sentence prefix in the request");
  const telemetry = bounded.result.coverage.categoryPromptTelemetry;
  assert.equal(telemetry.inputTokenCap, tinyInputCap);
  assert.equal(telemetry.omittedPassageCount, 1);
  assert.equal(telemetry.windowedPassageCount, 1);
  assert.ok(telemetry.omissionReasons.includes("input-cap"));
  assert.equal(telemetry.outcome, "capped");
});

test("scopes grounded category passages, collapses duplicates, and preserves source audit receipts", async () => {
  const project = { name: "Project Atlas", location: "Taylor County, Texas" };
  const passage = [
    "Project Atlas is located in Taylor County, Texas.",
    "The utility filing reports the project-specific interconnection timeline as 365 days for the 2026 construction phase.",
    "The filing names the campus, planned electrical service, request status, and expected study milestone.",
  ].join(" ");
  const nearDuplicate = `${passage} See filing schedule.`;
  const unrelatedPassage = "Project Atlas water records describe a separate municipal supply review for the campus.";
  const source = ({
    id,
    url,
    categoryIds,
    text,
    physicalOpenIndex,
    date = "2026-06-01",
    reportingDate = "2026-05-28",
  }) => ({
    occurrenceId: id,
    url,
    originalUrl: url,
    canonicalUrl: url,
    title: `Project Atlas filing ${id}`,
    publisher: "Taylor County Public Records",
    date,
    reportingDate,
    sourceChannel: "county-records",
    origin: "google-grounded-search",
    sourceClass: "primary-government",
    categoryIds,
    supportedEvidenceIds: ["grid_interconnection"],
    claimSupport: [{ evidenceId: "grid_interconnection", values: [365] }],
    exactProject: true,
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    timePeriod: "2026",
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      originalUrl: url,
      resolvedUrl: url,
      canonicalUrl: url,
      passage: text,
      physicalOpenIndex,
      retrievalTime: "2026-09-30T12:00:00.000Z",
      reused: physicalOpenIndex === 1,
      extractionMethod: "html-main-content",
      contentHash: `fixture-hash-${id}`,
      ...(id === "grid-source-1" ? {
        structuredFields: [
          { label: "Project Name", value: "DB Data Center Red Oak, LLC" },
          { label: "Estimated Cost", value: "$301,000,000" },
          { label: "Square Feet", value: "221,434" },
          { label: "Start Date", value: "February 1, 2025" },
          { label: "Completion Date", value: "January 31, 2027" },
        ],
      } : {}),
    },
  });
  const representative = source({
    id: "grid-source-1",
    url: "https://records.example.gov/atlas/grid",
    categoryIds: ["grid"],
    text: passage,
    physicalOpenIndex: 1,
  });
  const duplicate = source({
    id: "grid-source-2",
    url: "https://records.example.gov/atlas/grid-copy",
    categoryIds: ["grid"],
    text: nearDuplicate,
    physicalOpenIndex: 2,
  });
  const unique = source({
    id: "grid-source-3",
    url: "https://records.example.gov/atlas/grid-schedule",
    categoryIds: ["grid"],
    text: "The utility's 2026 service schedule identifies a separate study milestone for Project Atlas in Taylor County.",
    physicalOpenIndex: 3,
  });
  const differentFinding = source({
    id: "grid-source-4",
    url: "https://records.example.gov/atlas/grid-amended",
    categoryIds: ["grid"],
    text: passage.replace("365 days", "180 days"),
    physicalOpenIndex: 4,
  });
  const longPassage = `${passage} ${Array.from(
    { length: 320 },
    (_, index) => `Record section ${index} reports a distinct public filing detail for Project Atlas and its utility milestone.`,
  ).join(" ")}`;
  assert.ok(longPassage.length > 20_000);
  const longSource = source({
    id: "grid-source-5",
    url: "https://records.example.gov/atlas/grid-full-record",
    categoryIds: ["grid"],
    text: longPassage,
    physicalOpenIndex: 5,
  });
  const unrelated = source({
    id: "water-source",
    url: "https://records.example.gov/atlas/water",
    categoryIds: ["water"],
    text: unrelatedPassage,
    physicalOpenIndex: 6,
  });
  const research = validResearchResponse();
  for (const item of research.evidence) {
    item.sourceUrl = null;
    item.sourceUrls = [];
    item.citation = "No source cited for this non-grid item.";
  }
  const gridClaim = research.evidence.find((item) => item.id === "grid_interconnection");
  Object.assign(gridClaim, {
    value: 365,
    numericValue: 365,
    unit: "days",
    classification: "Management Assertion",
    citation: `${passage} https://records.example.gov/atlas/grid`,
    description: "The filing reports a 365-day interconnection timeline for the exact project.",
    sourceUrl: representative.url,
    sourceUrls: [representative.url],
    coverageStatus: "supported",
    sourceRelevance: "exact-project",
    claimPassage: passage,
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    claimTimePeriod: "2026",
  });
  let capturedRequest;
  const result = await researchProjectWithWebSearch(
    project,
    "fixture-provider-token",
    async (_url, init) => {
      capturedRequest = JSON.parse(init.body);
      return singleCallResponse(research, []);
    },
    undefined,
    {
      categoryId: "grid",
      label: "Grid",
      query: "Project Atlas grid interconnection",
      evidenceIds: ["grid_interconnection"],
      webSearchEnabled: false,
      groundedSources: [representative, duplicate, unique, differentFinding, longSource, unrelated],
    },
  );

  const userContent = capturedRequest.input.find((entry) => entry.role === "user").content;
  const marker = "Every claimPassage must be copied exactly from one supplied passage.\n";
  const sentPassages = JSON.parse(userContent.slice(userContent.indexOf(marker) + marker.length));
  assert.ok(sentPassages.length >= 3 && sentPassages.length <= 4,
    "the token cap may omit a long secondary window, but retained retrieval stays separate");
  assert.equal(sentPassages[0].passage, passage, "the retained passage must remain exact");
  assert.equal(sentPassages[0].sourceId, representative.occurrenceId);
  assert.equal(sentPassages[0].sourceUrl, representative.url);
  assert.equal(sentPassages[0].canonicalUrl, representative.canonicalUrl);
  assert.equal(sentPassages[0].sourceIdentity.sourceChannel, representative.sourceChannel);
  assert.equal(sentPassages[0].accessReceipt.physicalOpenIndex, 1);
  assert.equal(sentPassages[0].accessReceipt.retrievedAt, "2026-09-30T12:00:00.000Z");
  assert.equal(sentPassages[0].publicationDate, "2026-06-01");
  assert.equal(sentPassages[0].reportingDate, "2026-05-28");
  assert.deepEqual(sentPassages[0].structuredFields, [
    { label: "Project Name", value: "DB Data Center Red Oak, LLC" },
    { label: "Estimated Cost", value: "$301,000,000" },
    { label: "Square Feet", value: "221,434" },
    { label: "Start Date", value: "February 1, 2025" },
    { label: "Completion Date", value: "January 31, 2027" },
  ]);
  assert.equal(sentPassages[1].sourceId, unique.occurrenceId);
  assert.equal(sentPassages[2].passage, differentFinding.accessOutcome.passage);
  assert.match(sentPassages[2].passage, /180 days/);
  if (sentPassages[3]) {
    assert.notEqual(sentPassages[3].passage, longPassage, "the category packet uses a bounded window");
    assert.ok(sentPassages[3].passage.length <= 2_400);
  }
  assert.doesNotMatch(userContent, /grid-copy|water-source|municipal supply review/);

  const telemetry = result.coverage.categoryPromptTelemetry;
  assert.equal(telemetry.candidatePassageCount, 6);
  assert.equal(telemetry.uniquePassageCount, 4);
  assert.equal(telemetry.passageCountSent, sentPassages.length);
  assert.ok(telemetry.estimatedInputTokens <= telemetry.inputTokenCap);
  assert.ok(telemetry.requestBodyBytesReduced > 0);
  assert.equal(
    telemetry.requestBodyBytesBeforeFiltering - telemetry.requestBodyBytesAfterFiltering,
    telemetry.requestBodyBytesReduced,
  );
  assert.equal(result.coverage.providerAttempt.categoryPromptTelemetry.passageCountSent, sentPassages.length);
  assert.doesNotMatch(JSON.stringify(telemetry), /Project Atlas|records\.example\.gov|utility filing/);

  assert.deepEqual(
    new Set(result.sources.map((item) => item.canonicalUrl)),
    new Set([
      representative.canonicalUrl,
      duplicate.canonicalUrl,
      unique.canonicalUrl,
      differentFinding.canonicalUrl,
      longSource.canonicalUrl,
    ]),
    "deduplicating prompt passages must not remove routed source and receipt records",
  );
  assert.equal(result.sources.find((item) => item.canonicalUrl === duplicate.canonicalUrl).accessOutcome.physicalOpenIndex, 2);

  const withDuplicateSources = parseResearchResponse(
    result.research,
    result.sources,
    "2026-09-30",
    result.coverage,
    null,
    ["grid_interconnection"],
  ).evidence.find((item) => item.id === "grid_interconnection");
  const withoutPromptDuplicate = parseResearchResponse(
    research,
    [representative, unique],
    "2026-09-30",
    result.coverage,
    null,
    ["grid_interconnection"],
  ).evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(withDuplicateSources.eligibleForModel, true);
  assert.equal(withoutPromptDuplicate.eligibleForModel, withDuplicateSources.eligibleForModel);

  const orchestration = await orchestrateCategoryResearch(project, {
    categoryIds: ["grid"],
    retrieveCategory: async () => ({
      candidates: result.sources,
      categoryResolved: true,
      resolvedEvidenceIds: ["grid_interconnection"],
      observedQueries: ["Project Atlas grid interconnection"],
      providerAttempts: [result.coverage.providerAttempt],
      categoryResult: {
        categoryId: "grid",
        research: result.research,
        sources: result.sources,
        coverage: result.coverage,
      },
    }),
  });
  assert.equal(
    orchestration.categoryExecutions.grid.categoryPromptTelemetry[0].passageCountSent,
    result.coverage.categoryPromptTelemetry.passageCountSent,
  );

  const audit = buildResearchAudit({
    project,
    sources: result.sources,
    evidence: [withDuplicateSources],
    coverage: {
      providerAttempts: [result.coverage.providerAttempt],
      sourceAttemptRecords: [representative, duplicate, unique, differentFinding, longSource, unrelated],
      categoryExecutions: orchestration.categoryExecutions,
    },
  });
  const gridAudit = audit.categories.find((category) => category.categoryId === "grid");
  assert.equal(gridAudit.categoryPromptTelemetry[0].candidatePassageCount, 6);
  assert.ok(audit.sourceAttempts.some((attempt) => attempt.url === duplicate.canonicalUrl));
  assert.ok(gridAudit.openedDocuments.some((document) => document.physicalOpenIndex === 2));
});

test("honors provider reset pressure without retrying and cancels queued work", async () => {
  const gate = createResearchProviderGate({
    limit: 1,
    tokensPerMinute: 30_000,
    tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
  });
  let calls = 0;
  const rateLimitedFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: {
        message: "Token capacity is temporarily unavailable.",
        type: "tokens",
        code: "rate_limit_exceeded",
      },
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "0.03",
        "x-ratelimit-remaining-tokens": "0",
        "x-ratelimit-reset-tokens": "30ms",
      },
    });
  };
  await assert.rejects(researchProjectWithWebSearch(
    { name: "Project Atlas", location: "Ohio" },
    "server-secret-for-test",
    rateLimitedFetch,
    undefined,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], maxToolCalls: 1 },
    gate,
  ), (error) => {
    assert.equal(error.providerAttempt.outcome, "failed");
    assert.equal(error.providerAttempt.usage, null);
    return true;
  });
  const startedAt = Date.now();
  await researchProjectWithWebSearch(
    { name: "Project Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => {
      calls += 1;
      return singleCallResponse(validResearchResponse());
    },
    undefined,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], maxToolCalls: 1 },
    gate,
  );
  assert.ok(Date.now() - startedAt >= 20);
  assert.equal(calls, 2);

  const blockedGate = createResearchProviderGate({
    limit: 1,
    tokensPerMinute: 30_000,
    tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
  });
  await assert.rejects(researchProjectWithWebSearch(
    { name: "Project Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => new Response(JSON.stringify({
      error: { message: "Wait for reset.", type: "tokens", code: "rate_limit_exceeded" },
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "1",
      },
    }),
    undefined,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], maxToolCalls: 1 },
    blockedGate,
  ));
  const controller = new AbortController();
  let queuedFetchCalled = false;
  const queued = researchProjectWithWebSearch(
    { name: "Project Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => {
      queuedFetchCalled = true;
      return singleCallResponse(validResearchResponse());
    },
    controller.signal,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], maxToolCalls: 1 },
    blockedGate,
  );
  controller.abort();
  await assert.rejects(queued, (error) => {
    assert.equal(error.name, "ResearchCancelledError");
    assert.equal(error.providerAttempt.outcome, "cancelled-before-issue");
    assert.equal(error.providerAttempt.requestState, "cancelled-before-issue");
    assert.equal(error.providerAttempt.issuedAt, null);
    return true;
  });
  assert.equal(queuedFetchCalled, false);
});

test("pressure-gates every recognized temporary rate-limit code but not quota or unknown 429s", async () => {
  for (const [code, type, expectedBlocked] of [
    ["rate_limit_exceeded", "tokens", true],
    ["rate_limit_error", "tokens", true],
    ["too_many_requests", "request", true],
    ["insufficient_quota", "insufficient_quota", false],
    [undefined, undefined, false],
  ]) {
    let now = 1_000;
    const gate = createResearchProviderGate({
      limit: 1,
      now: () => now,
      schedule: () => ({ pending: true }),
      cancelSchedule: () => {},
    });
    await assert.rejects(researchProjectWithWebSearch(
      { name: "Pressure Atlas", location: "Ohio" },
      "server-secret-for-test",
      async () => new Response(JSON.stringify({
        error: { message: "Retry after a short wait.", code, type },
      }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "5" },
      }),
      undefined,
      { categoryId: "grid", evidenceIds: ["grid_interconnection"] },
      gate,
    ), (error) => {
      assert.equal(error.providerAttempt.status, 429);
      assert.equal(error.providerAttempt.outcome, "failed");
      assert.equal(error.providerAttempt.providerDiagnostic.upstreamStatus, 429);
      return true;
    });
    assert.equal(gate.snapshot().blockedUntil, expectedBlocked ? now + 5_000 : 0);
  }

  let now = 2_000;
  const noHeaderGate = createResearchProviderGate({
    limit: 1,
    now: () => now,
    schedule: () => ({ pending: true }),
    cancelSchedule: () => {},
  });
  await assert.rejects(researchProjectWithWebSearch(
    { name: "No Header Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => new Response(JSON.stringify({
      error: { message: "Rate limited.", code: "rate_limit_error" },
    }), { status: 429, headers: { "content-type": "application/json" } }),
    undefined,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"] },
    noHeaderGate,
  ));
  assert.equal(noHeaderGate.snapshot().blockedUntil, now + 1_000);

  const dateNow = Date.parse("2026-10-01T12:00:00.000Z");
  const dateGate = createResearchProviderGate({
    limit: 1,
    now: () => dateNow,
    schedule: () => ({ pending: true }),
    cancelSchedule: () => {},
  });
  await assert.rejects(researchProjectWithWebSearch(
    { name: "Date Header Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => new Response(JSON.stringify({
      error: { message: "Wait for reset.", type: "tokens", code: "rate_limit_exceeded" },
    }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": new Date(dateNow + 5_000).toUTCString() },
    }),
    undefined,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"] },
    dateGate,
  ));
  assert.equal(dateGate.snapshot().blockedUntil, dateNow + 5_000);

  for (const retryAfter of ["5 seconds", "not a valid date"]) {
    const invalidHeaderNow = 12_000;
    const invalidHeaderGate = createResearchProviderGate({
      limit: 1,
      now: () => invalidHeaderNow,
      schedule: () => ({ pending: true }),
      cancelSchedule: () => {},
    });
    await assert.rejects(researchProjectWithWebSearch(
      { name: "Malformed Retry Atlas", location: "Ohio" },
      "server-secret-for-test",
      async () => new Response(JSON.stringify({
        error: { message: "Malformed Retry-After.", type: "tokens", code: "rate_limit_exceeded" },
      }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": retryAfter },
      }),
      undefined,
      { categoryId: "grid", evidenceIds: ["grid_interconnection"] },
      invalidHeaderGate,
    ));
    assert.equal(
      invalidHeaderGate.snapshot().blockedUntil,
      invalidHeaderNow + 1_000,
      `unparseable Retry-After ${JSON.stringify(retryAfter)} must use the bounded fallback rather than guessing a delay`,
    );
  }
});

test("schedules eight foundation-first categories within a simulated 30k TPM window", async () => {
  const categoryIds = [
    "project-identity",
    "grid",
    "construction-capital",
    "permitting-community",
    "water",
    "tenant-counterparty",
    "electricity",
    "climate-operational-hazard",
  ];
  let now = 0;
  const scheduled = [];
  const gate = createResearchProviderGate({
    limit: 1,
    tokensPerMinute: 30_000,
    tokenWindowMs: 60_000,
    now: () => now,
    schedule: (callback, delayMs) => {
      const timer = { callback, dueAt: now + delayMs, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancelSchedule: (timer) => { timer.cancelled = true; },
  });
  const starts = [];
  const attempts = categoryIds.map((categoryId) => gate.run(async () => {
    starts.push({ categoryId, at: now });
  }, {
    estimatedTokens: 4_000,
    deadlineAt: 180_000,
    minimumResponseMs: 1_000,
  }));
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  assert.equal(starts.length, 7);
  assert.equal(gate.snapshot().reservedTokensInWindow, 28_000);
  const wake = scheduled.filter((timer) => !timer.cancelled).sort((left, right) => left.dueAt - right.dueAt)[0];
  assert.equal(wake.dueAt, 60_000);
  now = wake.dueAt;
  wake.callback();
  await Promise.all(attempts);
  assert.deepEqual(starts.map((entry) => entry.categoryId), categoryIds);
  assert.deepEqual(starts.map((entry) => entry.at), [0, 0, 0, 0, 0, 0, 0, 60_000]);
});

test("reports one elapsed TPM wait after repeated queue drains", async () => {
  let now = 0;
  const scheduled = [];
  const gate = createResearchProviderGate({
    limit: 1,
    tokensPerMinute: 30_000,
    tokenWindowMs: 60_000,
    now: () => now,
    schedule: (callback, delayMs) => {
      const timer = { callback, dueAt: now + delayMs, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancelSchedule: (timer) => { timer.cancelled = true; },
  });

  await gate.run(async () => {}, { estimatedTokens: 20_000 });
  let observedTpmWaitMs = null;
  const waiting = gate.run(async () => {}, {
    estimatedTokens: 20_000,
    onStart: (admission) => { observedTpmWaitMs = admission.tpmWaitMs; },
  });
  const additionalWaiters = Array.from({ length: 4 }, () => gate.run(async () => {}, {
    estimatedTokens: 0,
  }));
  const wake = scheduled.filter((timer) => !timer.cancelled).at(-1);
  assert.equal(wake.dueAt, 60_000);

  now = wake.dueAt;
  wake.callback();
  await Promise.all([waiting, ...additionalWaiters]);
  assert.equal(observedTpmWaitMs, 60_000,
    "re-draining the queue must not add projected waits more than once; telemetry is elapsed time");
});

test("keeps an issued deadline cancellation distinct and reports concurrent analysis count", async () => {
  const gate = createResearchProviderGate({ limit: 1 });
  const analysisTracker = { inFlight: 0, peak: 0, attempts: [] };
  const controller = new AbortController();
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const pending = researchProjectWithWebSearch(
    { name: "Cancelled Atlas", location: "Ohio" },
    "server-secret-for-test",
    async (_url, init) => {
      markStarted();
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("deadline"), { name: "AbortError" }));
        }, { once: true });
      });
    },
    controller.signal,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], analysisTracker },
    gate,
  );
  await started;
  assert.equal(analysisTracker.inFlight, 1);
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(error.providerAttempt.outcome, "cancelled-after-issue");
    assert.equal(error.providerAttempt.requestState, "cancelled-after-issue");
    assert.equal(error.providerAttempt.status, null);
    assert.equal(error.providerAttempt.inFlightAnalysisCountAtIssue, 1);
    assert.equal(error.providerAttempt.inFlightAnalysisCount, 0);
    return true;
  });
  assert.equal(analysisTracker.inFlight, 0);
  assert.equal(analysisTracker.peak, 1);
  assert.equal(analysisTracker.attempts.length, 1);

  const bodyController = new AbortController();
  const bodyTracker = { inFlight: 0, peak: 0, attempts: [] };
  await assert.rejects(researchProjectWithWebSearch(
    { name: "Body Cancelled Atlas", location: "Ohio" },
    "server-secret-for-test",
    async () => ({
      ok: true,
      status: 200,
      text: async () => {
        bodyController.abort();
        throw Object.assign(new Error("deadline"), { name: "AbortError" });
      },
    }),
    bodyController.signal,
    { categoryId: "grid", evidenceIds: ["grid_interconnection"], analysisTracker: bodyTracker },
    createResearchProviderGate({ limit: 1 }),
  ), (error) => {
    assert.equal(error.providerAttempt.requestState, "cancelled-after-issue");
    assert.equal(error.providerAttempt.outcome, "cancelled-after-issue");
    assert.equal(error.providerAttempt.status, 200);
    assert.equal(error.providerAttempt.failureClassification, "timeout");
    assert.equal(error.providerAttempt.inFlightAnalysisCount, 0);
    return true;
  });
  assert.equal(bodyTracker.inFlight, 0);
});

test("blocks mapped IPv4-mapped IPv6 destinations and oversized streamed responses", async () => {
  assert.equal(evaluateResearchDocumentAccess({ url: "https://[::ffff:127.0.0.1]/admin" }).reason, "private-destination");
  const oversized = await accessResearchDocument({ url: "https://example.gov/large", accessStatus: "open" }, {
    maxBytes: 8,
    fetchImpl: async () => new Response(new Uint8Array(32), {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
  });
  assert.equal(oversized.state, "blocked");
  assert.equal(oversized.reason, "size-limit");
});

test("distinguishes sanitized DNS validation outcomes without weakening mixed-address rejection", async () => {
  await assert.rejects(
    resolvePublicAddress("not a URL", async () => []),
    (error) => error.addressValidationReason === "malformed-destination",
  );
  await assert.rejects(
    resolvePublicAddress("https://records.example/report", async () => {
      throw Object.assign(new Error("resolver detail must not be retained"), { code: "EAI_AGAIN" });
    }),
    (error) => error.addressValidationReason === "dns-lookup-failure",
  );
  await assert.rejects(
    resolvePublicAddress("https://records.example/report", async () => []),
    (error) => error.addressValidationReason === "no-usable-public-address",
  );
  await assert.rejects(
    resolvePublicAddress("https://records.example/report", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    (error) => error.addressValidationReason === "prohibited-address-class",
  );
});

test("aborted DNS lookup settles promptly and ignores a late injected answer", async () => {
  const controller = new AbortController();
  let dnsStarted;
  let resolveLate;
  let observedOptions;
  const lookupStarted = new Promise((resolve) => { dnsStarted = resolve; });
  const pending = resolvePublicAddress("https://records.example/report", (_hostname, options) => {
    observedOptions = options;
    return new Promise((resolve) => {
      resolveLate = resolve;
      dnsStarted();
    });
  }, controller.signal);
  await lookupStarted;
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === "ResearchCancelledError");
  assert.deepEqual(observedOptions, { all: true, verbatim: true });
  resolveLate([{ address: "93.184.216.34", family: 4 }]);
  await new Promise((resolve) => setImmediate(resolve));
});

test("retains an issued provider attempt when the HTTP response cannot be parsed", async () => {
  await assert.rejects(
    researchProjectWithWebSearch(
      { name: "Project Atlas", location: "Ohio" },
      "server-secret-for-test",
      async () => new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      undefined,
      { categoryId: "grid", evidenceIds: ["grid_interconnection"], maxToolCalls: 1 },
    ),
    (error) => {
      assert.equal(error.name, "ResearchParseError");
      assert.equal(error.providerAttempt.requestState, "failed");
      assert.equal(error.providerAttempt.outcome, "failed");
      assert.equal(error.providerAttempt.status, 200);
      assert.ok(error.providerAttempt.issuedAt);
      assert.equal(error.providerAttempt.usage, null);
      return true;
    },
  );
});

test("bounds category retrieval, allows one gap follow-up, and preserves provider failures", async () => {
  const calls = [];
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      retrieveCategory: async ({ categoryId, attempt }) => {
        calls.push(`${categoryId}:${attempt}`);
        if (categoryId === "water") throw new Error("fixture provider failure");
        if (categoryId === "grid" && attempt === "primary") return {
          candidates: [{ url: "https://example.gov/grid", eligible: true }],
          gapDrivenFollowUp: true,
          observedQueries: ["observed grid primary"],
        };
        if (categoryId === "grid") return {
          candidates: [{ url: "https://example.gov/grid-follow-up" }],
          observedQueries: ["observed grid follow-up"],
        };
        return { candidates: [] };
      },
    },
  );
  assert.equal(run.categoryExecutions.grid.state, "Complete");
  assert.equal(run.categoryExecutions.grid.executedQueries.length, 2);
  assert.equal(run.categoryExecutions.water.state, "Provider failure");
  assert.equal(run.followUps, 1);
  assert.ok(run.providerRequests <= 8 + 1);
  assert.ok(calls.includes("grid:follow-up"));
});

test("retains HTTP 200 primary research when the deadline cancels a queued follow-up before issue", async () => {
  const project = { name: "Project Atlas", location: "Taylor County, Texas" };
  const grid = buildResearchCategoryPlan(project).categories.find((category) => category.categoryId === "grid");
  const controller = new AbortController();
  const deadlineState = { expired: false };
  let gateCalls = 0;
  let followUpQueued = false;
  let fetchCalls = 0;
  const providerGate = {
    run(operation, { signal, onStart } = {}) {
      gateCalls += 1;
      if (gateCalls === 1) {
        onStart?.();
        return operation();
      }
      followUpQueued = true;
      return new Promise((resolve, reject) => {
        const cancelBeforeIssue = () => {
          const error = new Error("The overall research deadline expired while the request was queued.");
          error.name = "ResearchCancelledError";
          error.researchErrorType = "cancelled";
          reject(error);
        };
        if (signal?.aborted) cancelBeforeIssue();
        else signal?.addEventListener("abort", cancelBeforeIssue, { once: true });
      });
    },
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    const body = await singleCallResponse(validResearchResponse()).json();
    body.id = "resp_fixture_primary_grid";
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const retainedSource = withRetrievedPassage(retrievedSource);
  const orchestration = await orchestrateCategoryResearch(project, {
    categoryIds: ["grid"],
    signal: controller.signal,
    deadlineState,
    retrieveCategory: async ({ categoryId, query, attempt }) => {
      const responsePromise = researchProjectWithWebSearch(
        project,
        "fixture-provider-token",
        fetchImpl,
        controller.signal,
        {
          categoryId,
          evidenceIds: grid.evidenceIds,
          query,
          attempt,
          maxToolCalls: 1,
        },
        providerGate,
      );
      if (attempt === "follow-up") {
        await Promise.resolve();
        assert.equal(followUpQueued, true, "the follow-up should enter the provider queue before the deadline");
        deadlineState.expired = true;
        controller.abort();
        return responsePromise;
      }
      const response = await responsePromise;
      return {
        ...response,
        categoryResult: {
          categoryId,
          research: response.research,
          rawResearch: response.research,
          sources: [retainedSource],
          coverage: response.coverage,
        },
        candidates: [],
        providerAttempts: [response.coverage.providerAttempt],
        providerRequestCount: 1,
        observedQueries: [query],
        gapDrivenFollowUp: true,
        unresolvedEvidenceIds: grid.evidenceIds,
      };
    },
  });

  assert.equal(fetchCalls, 1, "the cancelled queued follow-up must not issue an HTTP request");
  assert.equal(orchestration.categoryResults.length, 1, "the successful primary result must survive orchestration");
  assert.equal(orchestration.providerRequests, 1, "only the issued primary request counts as a provider request");
  const execution = orchestration.categoryExecutions.grid;
  assert.equal(execution.primaryAnalysisCompleted, true);
  assert.equal(execution.followUpAttemptState, "cancelled-before-issue");
  assert.equal(execution.followUpCancellationReason, "deadline");
  assert.equal(execution.issuedFollowUpQuery, null);
  assert.equal(execution.followUpCount, 0);

  const mergedResearch = mergeCategoryResearchResults(project, orchestration.categoryResults);
  assert.equal(mergedResearch.projectSummary.name, "Project Atlas");
  const validatedResearch = parseResearchResponse(
    mergedResearch,
    [retainedSource],
    "2026-09-30",
    { categoryExecutions: orchestration.categoryExecutions },
    null,
  );
  assert.ok(validatedResearch.evidence.some((item) => item.id === "grid_interconnection"));

  const audit = buildResearchAudit({
    project,
    coverage: {
      categoryExecutions: orchestration.categoryExecutions,
      providerAttempts: execution.providerAttempts,
      providerRequestCount: orchestration.providerRequests,
      terminalReasonCodes: ["deadline"],
      providerResponseIds: execution.providerAttempts.map((attempt) => attempt.providerResponseId),
    },
    sources: [retainedSource],
    evidence: validatedResearch.evidence,
  });
  assert.deepEqual(audit.providerResponseIds, ["resp_fixture_primary_grid"]);
  assert.equal(audit.providerRequestCount, 1);
  assert.equal(audit.providerAttemptCount, 2);
  assert.equal(audit.providerRequestBudget.issued, 1);
  const gridAudit = audit.categories.find((category) => category.categoryId === "grid");
  assert.equal(gridAudit.primaryAnalysisCompleted, true);
  assert.equal(gridAudit.followUpAttemptState, "cancelled-before-issue");
  assert.equal(gridAudit.followUpCancellationReason, "deadline");
  assert.equal(gridAudit.followUpCount, 0);
});

test("counts zero-provider official discovery and candidate access under one physical-open budget", async () => {
  const research = validResearchResponse();
  for (const item of research.evidence) {
    item.sourceUrl = null;
    item.sourceUrls = [];
    item.citation = "No supporting retrieved source was returned.";
    item.classification = "Missing Evidence";
    item.value = "Not disclosed";
    item.numericValue = null;
    item.coverageStatus = "searched-no-support";
    item.claimPassage = "No exact public passage was retained.";
    item.facilityScope = "unknown";
    item.phaseScope = "unknown";
    item.claimTimePeriod = null;
  }
  let documentRequests = 0;
  const result = await runValidatedResearch({
    name: "Wintersburg 313",
    location: "Maricopa County, Arizona",
    knownData: {
      sourceUrl: "https://operator.example/projects/wintersburg-313",
      companyDomains: ["operator.example"],
      state: "Arizona",
    },
  }, {
    apiKey: "server-secret-for-test",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    fetchImpl: async () => singleCallResponse(research, []),
    documentFetchImpl: async (url) => {
      documentRequests += 1;
      if (url === "https://operator.example/projects/wintersburg-313") {
        return substantiveHtmlResponse("Wintersburg 313 Official project record.", url);
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    },
  });
  const category = result.researchAudit.categories.find((item) => item.categoryId === "water");
  assert.ok(category.discoveryAttempts.length > 0,
    "the selected category should retain discovery attempts for its sources");
  assert.ok(category.discoveryAttempts.every((attempt) => Number.isInteger(attempt.physicalOpenIndex)));
  assert.ok(result.researchAudit.physicalOpensUsed >= category.discoveryAttempts.length);
  assert.ok(result.researchAudit.physicalOpensUsed <= RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.ok(documentRequests >= category.discoveryAttempts.length);
  assert.ok(result.sourceLedger.some((entry) => entry.sourceChannel === "declared-source-url"));
  assert.equal(category.sourceChannelTelemetry.some((entry) => entry.outcome === "no-return"), true);
  assert.ok(category.noReturnCounts.noPublicUrl > 0);
  assert.ok(category.authorityRecords.length > 0);
  assert.ok(category.authorityRecords.every((authority) =>
    authority.jurisdiction
      && authority.establishmentMethod
      && authority.discoveredAt
      && Array.isArray(authority.urlsAttempted)
      && Array.isArray(authority.accessOutcomes)));
});

test("keeps SEC connector failure diagnostic without starving category research", async () => {
  const sourceUrl = "https://operator.example/atlas/capital-update";
  let connectorCalls = 0;
  const result = await runValidatedResearch({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    knownData: { operator: "Atlas Compute" },
  }, {
    apiKey: "server-secret-for-test",
    req: request({}),
    categoryIds: ["construction-capital"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    secConnector: {
      search: async () => {
        connectorCalls += 1;
        throw new Error("SEC fixture unavailable");
      },
    },
    fetchImpl: async () => singleCallResponse(validResearchResponse(), [{
      url: sourceUrl,
      title: "Atlas capital update",
      snippet: "Project Atlas construction capital update.",
    }]),
    documentFetchImpl: async (url) => substantiveHtmlResponse("Project Atlas construction capital update.", url),
  });
  const category = result.researchAudit.categories.find((item) => item.categoryId === "construction-capital");
  assert.equal(connectorCalls, 1);
  assert.equal(category.secConnectorAttempts[0].outcome, "failed");
  assert.ok(result.sourceLedger.some((entry) => entry.canonicalUrl === sourceUrl));
  assert.ok(category.stageCounts.accessed > 0);
});

test("actual request workflow returns retrieved receipts as HTTP 200 partial after category HTTP 429", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-partial-429-"));
  const candidate = { ...fixture.accessibleReceipt, excerpt: fixture.accessibleReceipt.passage };
  const response = responseRecorder();
  let persisted;
  const saved = new Promise((resolve) => { persisted = resolve; });
  await handleResearchProjectRequest(request({
    ...fixture.project,
    forceRefresh: true,
  }), response, {
    apiKey: "synthetic-test-key",
    cache: createResearchProjectCache({ directory }),
    auditRepository: { save: async (record) => {
      assert.ok(response.body, "the HTTP response must precede the database write");
      persisted(record);
    } },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "synthetic rate limit", type: "rate_limit_error", code: "rate_limit_exceeded" },
    }), { status: fixture.providerFailures[0].httpStatus }),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
  });
  const payload = response.json();
  const record = await saved;
  const receipt = payload.sourceLedger.find((source) => source.originalUrl === candidate.url);
  const water = payload.researchAudit.categories.find((category) => category.categoryId === "water");
  assert.equal(response.statusCode, 200);
  assert.equal(payload.researchStatus, "partial");
  assert.equal(payload.projectSummary.capacityMW, null);
  assert.equal(payload.projectSummary.capacityProvenance, "unknown");
  assert.equal(record.researchStatus, "partial");
  assert.equal(record.projectSummary.capacityMW, null);
  assert.equal(record.projectSummary.capacityProvenance, "unknown");
  assert.equal(record.audit.runCorrelationId, payload.researchAudit.runCorrelationId);
  assert.ok(record.audit.categories.find((category) => category.categoryId === "water").openedDocuments.some((document) =>
    document.accessState === "accessible"
    && document.retainedPassage.includes(fixture.accessibleReceipt.passage)));
  assert.equal(payload.researchOutcome.eligibleEvidenceCount, 0);
  assert.ok(receipt, "the accessible source is retained in the source ledger");
  assert.equal(receipt.date ?? receipt.publishedAt, fixture.accessibleReceipt.date);
  assert.equal(receipt.accessOutcome.state, "accessible");
  assert.ok(receipt.accessOutcome.passage.includes(fixture.accessibleReceipt.passage));
  assert.equal(receipt.accessOutcome.physicalOpenIndex, 1);
  assert.ok(water.openedDocuments.some((document) =>
    document.accessState === "accessible" && document.retainedPassage.includes(fixture.accessibleReceipt.passage)));
  assert.ok(payload.researchAudit.providerLimitations.some((limitation) => /structured category analysis failed/i.test(limitation)));
  assert.ok(payload.evidence.filter((item) => item.id.startsWith("water_")).every((item) => item.eligibleForModel === false));
});

test("retries a category HTTP 429 with Retry-After once only when the deadline allows it", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = { ...fixture.accessibleReceipt, categoryIds: ["water"], excerpt: fixture.accessibleReceipt.passage };
  const buildOptions = async (fetchImpl, researchTimeoutMs) => ({
    apiKey: "synthetic-test-key",
    cache: createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "research-429-retry-")) }),
    registry: { retain: async () => {} },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    providerGate: createResearchProviderGate({
      tokensPerMinute: 30_000,
      tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
    }),
    researchTimeoutMs,
    analysisReserveMs: 0,
    documentTimeoutMs: 100,
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
    fetchImpl,
  });
  const limited = () => new Response(JSON.stringify({
    error: { code: "rate_limit_exceeded", type: "rate_limit_error", message: "Synthetic pressure" },
  }), { status: 429, headers: { "retry-after": "1" } });
  let calls = 0;
  const successful = responseRecorder();
  await handleResearchProjectRequest(request({ ...fixture.project, forceRefresh: true }), successful,
    await buildOptions(async () => {
      calls += 1;
      return calls === 1 ? limited() : singleCallResponse(validResearchResponse());
    }, 4_000));
  assert.ok(calls >= 2, "the 429 is followed by one bounded retry; later supplemental analysis is separate");
  assert.equal(successful.statusCode, 200);
  assert.equal(successful.json().researchAudit.providerAttempts.filter((attempt) =>
    attempt.categoryId === "water" && attempt.status === 429).length, 1);
  assert.equal(successful.json().researchAudit.providerAttempts[0].providerDiagnostic.rateLimit.retryAfter, "1");
  assert.equal(successful.json().researchAudit.categories.find((category) =>
    category.categoryId === "water").retryCount, 1);

  calls = 0;
  const tooLate = responseRecorder();
  await handleResearchProjectRequest(request({ ...fixture.project, forceRefresh: true }), tooLate,
    await buildOptions(async () => {
      calls += 1;
      return new Response(JSON.stringify({
        error: { code: "rate_limit_exceeded", type: "rate_limit_error", message: "Synthetic pressure" },
      }), { status: 429, headers: { "retry-after": "30" } });
    }, 10_000));
  assert.equal(calls, 1);
  assert.equal(tooLate.statusCode, 200);
  const tooLatePayload = tooLate.json();
  const tooLateWater = tooLatePayload.researchAudit.categories.find((category) => category.categoryId === "water");
  assert.equal(tooLatePayload.researchStatus, "partial");
  assert.equal(tooLateWater.analysisState, "not-analyzed-429");
  assert.equal(tooLateWater.retryCount, 0);
  assert.equal(tooLateWater.executionOutcome, "completed");
  assert.equal(tooLateWater.analysisOutcome, "not-run");
  assert.equal(tooLateWater.searchCompleteness, "observed");
  assert.equal(tooLateWater.searchCompletenessLabel, null);
  assert.ok(tooLatePayload.researchAudit.providerAttempts.some((attempt) =>
    attempt.status === 429 && attempt.providerDiagnostic?.rateLimit?.retryAfter === "30"));
  assert.ok(tooLatePayload.sourceLedger.some((source) =>
    source.originalUrl === candidate.url
    && source.accessOutcome?.state === "accessible"
    && source.accessOutcome.passage?.includes(fixture.accessibleReceipt.passage)));
});

test("single-shot request header suppresses category 429 retry while retaining the grounded receipt", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = {
    ...fixture.accessibleReceipt,
    categoryIds: ["water"],
    excerpt: fixture.accessibleReceipt.passage,
  };
  const req = request({ ...fixture.project, forceRefresh: true });
  req.headers = { "x-safeloc-research-policy": "single-shot" };
  const response = responseRecorder();
  let providerCalls = 0;

  await handleResearchProjectRequest(req, response, {
    apiKey: "synthetic-test-key",
    googleApiKey: null,
    cache: createResearchProjectCache({
      directory: await mkdtemp(path.join(os.tmpdir(), "research-single-shot-429-")),
    }),
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    researchTimeoutMs: 30_000,
    analysisReserveMs: 0,
    documentTimeoutMs: 100,
    researchBudgetOverrides: {
      maxProviderRequests: 4,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 2,
      maxTotalCandidates: 2,
      maxToolCalls: 1,
      maxPhysicalDocumentOpens: 2,
    },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        error: { code: "rate_limit_exceeded", type: "rate_limit_error", message: "Synthetic pressure" },
      }), { status: 429, headers: { "retry-after": "0" } });
    },
  });

  const payload = response.json();
  const water = payload.researchAudit.categories.find((category) => category.categoryId === "water");
  const retryableAttempts = payload.researchAudit.providerAttempts.filter((attempt) =>
    attempt.categoryId === "water" && attempt.status === 429);
  assert.equal(response.statusCode, 200);
  assert.equal(providerCalls, 1, "the single-shot header must disable the handler's otherwise-default 429 retry");
  assert.equal(payload.researchStatus, "partial");
  assert.equal(payload.researchAudit.providerRequestBudget.maximum, 4);
  assert.equal(Date.parse(payload.researchAudit.deadlineAt) - Date.parse(payload.researchAudit.startedAt) > 1_000, true);
  assert.equal(retryableAttempts.length, 1);
  assert.equal(retryableAttempts[0].retryCount, 0);
  assert.equal(retryableAttempts[0].providerDiagnostic.rateLimit.retryAfter, "0");
  assert.equal(water.retryCount, 0);
  assert.ok(payload.sourceLedger.some((source) =>
    source.originalUrl === candidate.url
    && source.accessOutcome?.state === "accessible"
    && source.accessOutcome.passage?.includes(fixture.accessibleReceipt.passage)),
  "the retained Water receipt survives the single-shot 429");
});

test("synthetic DFW10 TDLR record retains eligible facility schedule and rejects campus or facility mismatch", async () => {
  const project = {
    name: "DataBank Red Oak DFW10",
    location: "Red Oak, Ellis County, Texas",
    knownData: {
      operator: "DataBank",
      aliases: ["DFW10"],
      city: "Red Oak",
      county: "Ellis County",
      state: "Texas",
    },
  };
  const urlFor = (facilityId) => `https://tdlr.texas.gov/TABS/Project/${facilityId}`;
  const makeRecord = (facilityId) => {
    const facilityStatement = `DataBank Red Oak - ${facilityId} is a building project in Red Oak, Ellis County, Texas, and DataBank is the project operator. This TDLR TABS record identifies the ${facilityId} building.`;
    const passage = [
      `${facilityStatement} The owner is DB Data Center Red Oak, LLC.`,
      "The record lists an estimated cost of $301,000,000 and an area of 221,434 square feet.",
      "The planned construction start date is February 1, 2025, with completion on January 31, 2027.",
    ].join(" ");
    const rows = [
      ["Project Name", `DataBank Red Oak - ${facilityId}`],
      ["Owner", "DB Data Center Red Oak, LLC"],
      ["Estimated Cost", "$301,000,000"],
      ["Square Feet", "221,434"],
      ["Start Date", "February 1, 2025"],
      ["Completion Date", "January 31, 2027"],
    ].map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("");
    const html = [
      "<!doctype html><html><head>",
      '<meta property="article:published_time" content="2025-02-03T12:00:00Z">',
      "</head><body><main>",
      `<p>${facilityStatement}</p>`,
      "<h1>TDLR TABS Building Construction Record</h1>",
      `<table>${rows}</table><p>${passage}</p>`,
      "<p>The public filing is an official project record and its named schedule applies to the building described in this entry.</p>",
      "</main></body></html>",
    ].join("");
    return { facilityStatement, passage, html };
  };

  const runRecord = async ({ facilityId = "DFW10", broadCampusScope = false } = {}) => {
    const url = urlFor(facilityId);
    const { facilityStatement, passage, html } = makeRecord(facilityId);
    const candidate = {
      url,
      title: "TDLR TABS Building Construction Record",
      categoryIds: ["permitting-community"],
      searchDomain: "permitting-community",
      sourceClass: "primary-government",
      sourceChannel: "google-grounded-search",
      exactProject: true,
      claimSupport: [{ evidenceId: "permitting_timeline", values: ["2025-02-01 – 2027-01-31"] }],
      facilityScope: facilityId === "DFW10" ? "exact-facility" : "related-facility",
      phaseScope: "not-applicable",
      timePeriod: "2025-2027",
    };
    const base = validResearchResponse();
    base.projectSummary = {
      ...base.projectSummary,
      name: project.name,
      location: project.location,
    };
    base.evidence = base.evidence
      .filter((item) => ["community_risk", "permitting_timeline", "carbon_compliance"].includes(item.id))
      .map((item) => item.id !== "permitting_timeline" ? item : ({
        ...item,
        value: "2025-02-01 – 2027-01-31",
        numericValue: null,
        unit: "date range",
        classification: "Verified Evidence",
        citation: `${facilityStatement} ${url}`,
        description: broadCampusScope
          ? "The Red Oak Campus has a planned construction date range from February 1, 2025, through January 31, 2027."
          : `The ${facilityId} building has a planned construction date range from February 1, 2025, through January 31, 2027.`,
        sourceUrl: url,
        sourceUrls: [url],
        coverageStatus: "supported",
        sourceRelevance: "exact-project",
        claimPassage: passage,
        facilityScope: broadCampusScope ? "exact-project" : "exact-facility",
        phaseScope: broadCampusScope ? "all-phases" : "not-applicable",
        claimTimePeriod: "2025-2027",
      }));
    const trace = createRedOakClaimTrace();
    const result = await runValidatedResearch(project, {
      apiKey: "offline-openai-key",
      googleApiKey: "offline-google-key",
      req: request({}),
      categoryIds: ["permitting-community"],
      allowGoogleFallback: false,
      allowCorrectiveRetries: false,
      allowProviderRetries: false,
      useDefaultSecConnector: false,
      researchBudgetOverrides: {
        maxProviderRequests: 2,
        maxPhysicalDocumentOpens: 1,
        maxFollowUps: 0,
        maxFollowUpsPerCategory: 0,
        maxCandidatesPerCategory: 2,
        maxTotalCandidates: 2,
      },
      researchTimeoutMs: 10_000,
      analysisReserveMs: 0,
      documentTimeoutMs: 1_000,
      rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
      googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      documentFetchImpl: async () => new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      fetchImpl: async (_requestUrl, init) => {
        const requestBody = JSON.parse(init.body);
        assert.equal(requestBody.tools, undefined, "grounded category analysis must not browse");
        return new Response(JSON.stringify({
          id: `resp_offline_tdlr_${facilityId}`,
          output: [{
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(base) }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
      claimTrace: trace,
      providerGate: createResearchProviderGate({
        tokensPerMinute: 30_000,
        tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
      }),
    });
    return { result, facilityStatement, passage, url };
  };

  const positive = await runRecord();
  const claim = positive.result.evidence.find((item) => item.id === "permitting_timeline");
  const source = positive.result.sourceLedger.find((item) => item.originalUrl === positive.url);
  assert.ok(source, "the accessed government source must remain in the canonical ledger");
  assert.equal(source.accessOutcome.state, "accessible");
  assert.equal(sourceEstablishesProjectIdentity(source, project), true, source.accessOutcome.passage);
  assert.equal(source.date ?? source.publishedAt, "2025-02-03");
  assert.equal(source.facilityScope, "exact-facility");
  assert.equal(source.phaseScope, "not-applicable");
  assert.ok(source.accessOutcome.passage.includes("DFW10"));
  assert.ok(source.accessOutcome.structuredFields.some((field) =>
    field.label === "Project Name" && field.value === "DataBank Red Oak - DFW10"));
  assert.ok(source.accessOutcome.structuredFields.some((field) =>
    field.label === "Owner" && field.value === "DB Data Center Red Oak, LLC"));
  assert.ok(source.accessOutcome.structuredFields.some((field) =>
    field.label === "Estimated Cost" && field.value === "$301,000,000"));
  assert.ok(source.accessOutcome.structuredFields.some((field) =>
    field.label === "Square Feet" && field.value === "221,434"));
  assert.ok(source.accessOutcome.structuredFields.some((field) =>
    field.label === "Completion Date" && field.value === "January 31, 2027"));
  assert.equal(claim.rawValue, "2025-02-01 – 2027-01-31");
  assert.ok(claim.numericValue > 23 && claim.numericValue < 24);
  assert.equal(claim.unit, "date range");
  assert.equal(claim.normalizedUnit, "months");
  assert.equal(claim.facilityScope, "exact-facility");
  assert.equal(claim.phaseScope, "not-applicable");
  assert.equal(claim.eligibleForModel, true);
  assert.equal(claim.sourceValidation.state, "financially-eligible");
  assert.ok(claim.claimMappings.some((mapping) =>
    mapping.supportStatus === "supported" && mapping.exactQuotation === positive.passage));
  assert.equal(claim.sourceValidation.eligibilityTrace.firstFailure, null);

  const campusClaim = (await runRecord({ broadCampusScope: true })).result.evidence
    .find((item) => item.id === "permitting_timeline");
  assert.equal(campusClaim.eligibleForModel, false);
  assert.ok(campusClaim.claimMappings.every((mapping) => mapping.supportStatus !== "supported"));

  const wrongFacilityRun = await runRecord({ facilityId: "DFW9" });
  const wrongFacilitySource = wrongFacilityRun.result.sourceLedger.find((item) =>
    item.originalUrl === wrongFacilityRun.url);
  assert.ok(wrongFacilitySource.accessOutcome.structuredFields.some((field) =>
    field.label === "Project Name" && field.value === "DataBank Red Oak - DFW9"));
  assert.ok(wrongFacilitySource.accessOutcome.structuredFields.some((field) =>
    field.label === "Owner" && field.value === "DB Data Center Red Oak, LLC"));
  const wrongFacility = wrongFacilityRun.result.evidence
    .find((item) => item.id === "permitting_timeline");
  assert.equal(wrongFacility.eligibleForModel, false);
  assert.ok(wrongFacility.claimMappings.every((mapping) => mapping.supportStatus !== "supported"));
});

test("actual validated workflow retains receipts after total category-analysis failure", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = { ...fixture.accessibleReceipt, excerpt: fixture.accessibleReceipt.passage };
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "synthetic provider unavailable", type: "server_error" },
    }), { status: fixture.providerFailures[1].httpStatus }),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
  });
  const receipt = result.sourceLedger.find((source) => source.originalUrl === candidate.url);
  assert.equal(result.researchStatus, "partial");
  assert.equal(result.researchOutcome.eligibleEvidenceCount, 0);
  assert.equal(receipt.accessOutcome.state, "accessible");
  assert.ok(receipt.accessOutcome.passage.includes(fixture.accessibleReceipt.passage));
  assert.equal(receipt.date ?? receipt.publishedAt, fixture.accessibleReceipt.date);
  assert.equal(receipt.dateBasis, "provider-source-metadata");
  assert.equal(result.researchAudit.categories.find((item) => item.categoryId === "water").openedDocuments[0].accessOutcome, "retrieved");
  assert.ok(result.evidence.every((item) => item.eligibleForModel === false));
});

test("carries extracted publication metadata through access receipts ahead of provider dates", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = { ...fixture.accessibleReceipt, excerpt: fixture.accessibleReceipt.passage };
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "synthetic provider unavailable", type: "server_error" },
    }), { status: fixture.providerFailures[1].httpStatus }),
    documentFetchImpl: async (url) => new Response(
      `<html><head>${fixture.publicationDateFixtures.semantic.markup}</head><body><main><article><h1>Public project record</h1><p>${fixture.accessibleReceipt.passage} ${substantiveHtmlPassage}</p></article></main></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    ),
  });
  const receipt = result.sourceLedger.find((source) => source.originalUrl === candidate.url);
  assert.equal(receipt.date, fixture.publicationDateFixtures.semantic.date);
  assert.equal(receipt.dateBasis, fixture.publicationDateFixtures.semantic.basis);
  assert.equal(receipt.publicationDateStatus, "resolved");
  assert.equal(receipt.accessOutcome.publicationDate, fixture.publicationDateFixtures.semantic.date);
  assert.equal(receipt.accessOutcome.publicationDateBasis, fixture.publicationDateFixtures.semantic.basis);
  assert.ok(receipt.accessOutcome.retrievalTime);
  assert.notEqual(receipt.date, fixture.accessibleReceipt.date);
  assert.equal(result.researchOutcome.eligibleEvidenceCount, 0);
});

test("does not use retrieval time as a publication date when both document and provider metadata are absent", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = {
    ...fixture.accessibleReceipt,
    date: null,
    publishedAt: null,
    excerpt: fixture.accessibleReceipt.passage,
  };
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "synthetic provider unavailable", type: "server_error" },
    }), { status: fixture.providerFailures[1].httpStatus }),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.publicationDateFixtures.noPublicationDate.unrelatedLines, url),
  });
  const receipt = result.sourceLedger.find((source) => source.originalUrl === candidate.url);
  assert.equal(receipt.date, null);
  assert.equal(receipt.publishedAt, null);
  assert.equal(receipt.dateBasis, "not-reported");
  assert.equal(receipt.accessOutcome.publicationDate, null);
  assert.equal(receipt.accessOutcome.publicationDateStatus, "absent");
  assert.ok(receipt.accessOutcome.retrievalTime);
});

test("parallel bounded document access lets a fast receipt survive a slow-document time slice", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const fastCandidate = { ...fixture.accessibleReceipt, excerpt: fixture.accessibleReceipt.passage };
  const slowCandidate = { ...fixture.slowDocument, excerpt: fixture.accessibleReceipt.passage };
  const started = Date.now();
  let activeFetches = 0;
  let peakFetches = 0;
  let slowAborted = false;
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([slowCandidate, fastCandidate]),
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "synthetic rate limit", type: "rate_limit_error", code: "rate_limit_exceeded" },
    }), { status: 429 }),
    documentFetchImpl: async (url, init) => {
      activeFetches += 1;
      peakFetches = Math.max(peakFetches, activeFetches);
      if (url === slowCandidate.url) {
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(new Response("late body", {
            status: 200,
            headers: { "content-type": "text/html" },
          })), 2_000);
          init.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            activeFetches -= 1;
            slowAborted = true;
            reject(Object.assign(new Error("aborted slow fixture"), { name: "AbortError" }));
          }, { once: true });
        });
      }
      activeFetches -= 1;
      return substantiveHtmlResponse(fixture.accessibleReceipt.passage, url);
    },
    researchTimeoutMs: 1_000,
    documentTimeoutMs: 35,
    analysisReserveMs: 100,
    maxConcurrentDocumentOpens: 2,
  });
  const elapsed = Date.now() - started;
  const fastReceipt = result.sourceLedger.find((source) => source.originalUrl === fastCandidate.url);
  assert.equal(fastReceipt.accessOutcome.state, "accessible");
  assert.ok(fastReceipt.accessOutcome.passage.includes(fixture.accessibleReceipt.passage));
  assert.ok(elapsed < 700, `bounded slow document monopolized the run (${elapsed}ms)`);
  assert.equal(peakFetches, 2);
  assert.equal(slowAborted, true);
  assert.ok(result.researchAudit.physicalOpensUsed <= RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(result.researchStatus, "partial");
});

test("provider deadline admission finalizes retained passages as a partial response after retrieval", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = { ...fixture.accessibleReceipt, excerpt: fixture.accessibleReceipt.passage };
  const started = Date.now();
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["water"],
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("synthetic analysis deadline"), { name: "AbortError" }));
      }, { once: true });
    }),
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
    researchTimeoutMs: 80,
    documentTimeoutMs: 40,
    analysisReserveMs: 10,
  });
  const elapsed = Date.now() - started;
  const receipt = result.sourceLedger.find((source) => source.originalUrl === candidate.url);
  const water = result.researchAudit.categories.find((category) => category.categoryId === "water");
  assert.equal(result.researchStatus, "partial");
  assert.equal(result.researchOutcome.eligibleEvidenceCount, 0);
  assert.equal(receipt.accessOutcome.state, "accessible");
  assert.ok(receipt.accessOutcome.passage.includes(fixture.accessibleReceipt.passage));
  assert.equal(receipt.date ?? receipt.publishedAt, fixture.accessibleReceipt.date);
  assert.ok(water.openedDocuments.some((document) => document.retainedPassage.includes(fixture.accessibleReceipt.passage)));
  assert.ok(result.researchAudit.terminalReasonCodes.includes("provider-deadline-admission"), JSON.stringify({
    terminalReasonCodes: result.researchAudit.terminalReasonCodes,
    researchStatus: result.researchStatus,
    water: {
      executionOutcome: water.executionOutcome,
      analysisOutcome: water.analysisOutcome,
      analysisState: water.analysisState,
      notRunReason: water.notRunReason,
    },
    phaseTiming: result.researchAudit.phaseTiming,
  }));
  assert.ok(elapsed < 600, `deadline did not promptly finalize the partial result (${elapsed}ms)`);
});

test("identity workflow ignores provider exactProject when location conflicts or passage spans states", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const cases = fixture.identityCases;
  for (const identityCase of cases) {
    const cityAndState = identityCase.location.split(",").map((part) => part.trim());
    const [city, state] = cityAndState;
    const candidate = {
      url: `https://records.example.test/atlas/${identityCase.name}`,
      title: "Project Atlas official identity record",
      date: "2026-03-14",
      categoryIds: ["project-identity"],
      sourceChannel: "synthetic-public-record",
      exactProject: true,
    };
    const result = await runValidatedResearch({
      name: "Project Atlas",
      location: identityCase.location,
      knownData: { city, state },
    }, {
      apiKey: "synthetic-test-key",
      req: request({}),
      categoryIds: ["project-identity"],
      rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
      googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
      fetchImpl: async () => new Response(JSON.stringify({
        error: { message: "synthetic provider unavailable", type: "server_error" },
      }), { status: 503 }),
      documentFetchImpl: async () => substantiveHtmlResponse(identityCase.passage, candidate.url),
    });
    const identity = result.researchAudit.categories.find((item) => item.categoryId === "project-identity");
    assert.equal(identity.stageCounts.allEvidenceEligible, identityCase.expectedExactProject, identityCase.name);
  }
});

test("canary Grid request is withheld unless a retained passage establishes exact project identity", async () => {
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: {
      operator: "DataBank",
      aliases: ["Red Oak Campus", "DataBank Red Oak Campus"],
      facilityIdentifiers: ["DFW9", "DFW10", "DFW11"],
      city: "Red Oak",
      county: "Ellis County",
      state: "Texas",
    },
  };
  const candidate = {
    url: "https://records.example.test/red-oak-campus",
    title: "Red Oak Campus DataBank project record",
    categoryIds: ["project-identity"],
    exactProject: true,
    sourceChannel: "synthetic-public-record",
  };
  const identityPassage = "The Red Oak Campus, located in Red Oak, Ellis County, Texas, is owned and operated by DataBank.";
  const relatedFacilityPassage = "DataBank's DFW9 building is part of the Red Oak Campus in Red Oak, Ellis County, Texas.";
  assert.equal(sourceEstablishesProjectIdentity({
    ...candidate,
    accessOutcome: { state: "accessible", passage: identityPassage },
  }, project), true);
  const relatedSource = {
    ...candidate,
    accessOutcome: { state: "accessible", passage: relatedFacilityPassage },
  };
  assert.equal(sourceEstablishesProjectIdentity(relatedSource, project), false,
    "related building identity must not be silently promoted to exact campus identity");
  assert.equal(sourceEstablishesRelatedFacilityIdentity(relatedSource, project), true);
  assert.deepEqual(evaluateCanaryGridIdentityGate([relatedSource], project), {
    required: true,
    state: "related-facility",
    usableRetainedPassageCount: 1,
    exactProjectPassageCount: 0,
    relatedFacilityPassageCount: 1,
    relatedFacilityIdentifiers: ["DFW9"],
    crossPassageCorroboratedFacilityIdentifiers: [],
    conflictedRelatedFacilityIdentifiers: [],
    reason: "A successfully retrieved retained passage establishes a named facility related to the requested project, but not exact campus identity.",
  });
  for (const [label, passage] of [
    ["facility identifier alone", "DFW9 is a data-center facility in Texas."],
    ["DataBank facility at the project location without a campus link", "DataBank's DFW9 facility is located in Red Oak, Ellis County, Texas."],
    ["unlinked DFW14", "DataBank operates DFW14 in Red Oak, Ellis County, Texas."],
    ["unlinked DFW15", "DataBank operates DFW15 in Red Oak, Ellis County, Texas."],
  ]) {
    const unresolvedGate = evaluateCanaryGridIdentityGate([{
      ...candidate,
      accessOutcome: { state: "accessible", passage },
    }], project);
    assert.equal(unresolvedGate.state, "unresolved", label);
    assert.deepEqual(unresolvedGate.relatedFacilityIdentifiers, [], label);
  }
  for (const [identifier, passage] of [
    ["DFW9", "DataBank's DFW9 building is part of the Red Oak Campus in Red Oak, Ellis County, Texas."],
    ["DFW10", "DataBank DFW10 is a building of the Red Oak Campus located in Red Oak, Ellis County, Texas."],
    ["DFW11", "The Red Oak Campus includes DFW11, operated by DataBank, in Red Oak, Ellis County, Texas."],
  ]) {
    const gate = evaluateCanaryGridIdentityGate([{
      ...candidate,
      accessOutcome: { state: "accessible", passage },
    }], project);
    assert.equal(gate.state, "related-facility", identifier);
    assert.equal(gate.exactProjectPassageCount, 0, identifier);
    assert.deepEqual(gate.relatedFacilityIdentifiers, [identifier]);
  }
  const crossPassageGate = evaluateCanaryGridIdentityGate([
    {
      ...candidate,
      accessOutcome: {
        state: "accessible",
        passage: "DataBank's DFW9 facility is located in Red Oak, Ellis County, Texas.",
      },
    },
    {
      ...candidate,
      url: "https://records.example.test/red-oak-campus-context",
      accessOutcome: {
        state: "accessible",
        passage: "The Red Oak Campus was listed in a municipal development presentation.",
      },
    },
  ], project);
  assert.equal(crossPassageGate.state, "related-facility");
  assert.equal(crossPassageGate.exactProjectPassageCount, 0);
  assert.equal(crossPassageGate.relatedFacilityPassageCount, 0,
    "cross-passage corroboration is recorded separately from a direct single-passage link");
  assert.deepEqual(crossPassageGate.relatedFacilityIdentifiers, ["DFW9"]);
  assert.deepEqual(crossPassageGate.crossPassageCorroboratedFacilityIdentifiers, ["DFW9"]);
  assert.match(crossPassageGate.reason, /Retained passages agree/);

  const conflictGate = evaluateCanaryGridIdentityGate([
    {
      ...candidate,
      accessOutcome: {
        state: "accessible",
        passage: "Compass operates the DFW9 facility in Red Oak, Ellis County, Texas.",
      },
    },
    {
      ...candidate,
      url: "https://records.example.test/red-oak-campus-context",
      accessOutcome: {
        state: "accessible",
        passage: "The Red Oak Campus was listed in a municipal development presentation.",
      },
    },
  ], project);
  assert.equal(conflictGate.state, "unresolved");
  assert.deepEqual(conflictGate.relatedFacilityIdentifiers, []);
  assert.deepEqual(conflictGate.conflictedRelatedFacilityIdentifiers, ["DFW9"]);

  const unrelatedGate = evaluateCanaryGridIdentityGate([
    {
      ...candidate,
      accessOutcome: {
        state: "accessible",
        passage: "DataBank operates DFW14 in Red Oak, Ellis County, Texas.",
      },
    },
    {
      ...candidate,
      url: "https://records.example.test/red-oak-campus-context",
      accessOutcome: {
        state: "accessible",
        passage: "The Red Oak Campus was listed in a municipal development presentation.",
      },
    },
  ], project);
  assert.equal(unrelatedGate.state, "unresolved");

  assert.equal(evaluateCanaryGridIdentityGate([{
    ...candidate,
    accessOutcome: { state: "accessible", passage: "DataBank operates data centers across Texas." },
  }], project).state, "unresolved",
  "provider exact-project flags cannot establish identity without connected retained-passage text");

  const baseOptions = {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["grid"],
    canaryGridIdentityGate: true,
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    researchBudgetOverrides: {
      maxProviderRequests: 2,
      maxPhysicalDocumentOpens: 8,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 8,
      maxTotalCandidates: 16,
    },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  };
  const canaryDiscovery = async (...args) => ({
    ...(await completedGoogleDiscovery([candidate])(...args)),
    providerAttempt: {
      provider: "google-gemini-grounding",
      model: "synthetic-test-model",
      issuedAt: new Date().toISOString(),
      outcome: "completed",
    },
  });

  let rejectedStructuredCalls = 0;
  const rejected = await runValidatedResearch(project, {
    ...baseOptions,
    googleDiscoveryImpl: canaryDiscovery,
    fetchImpl: async () => {
      rejectedStructuredCalls += 1;
      return singleCallResponse();
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse(
      "DataBank operates data centers across Texas.",
      url,
    ),
  });
  assert.equal(rejectedStructuredCalls, 0);
  assert.equal(rejected.researchAudit.providerRequestCount, 1);
  assert.equal(rejected.researchAudit.providerAttempts.filter((attempt) => attempt.categoryId === "grid").length, 0);
  assert.equal(rejected.researchAudit.canaryIdentityGate.state, "unresolved");
  assert.equal(rejected.researchAudit.canaryIdentityGate.usableRetainedPassageCount, 1);

  const events = [];
  let structuredCalls = 0;
  const accepted = await runValidatedResearch(project, {
    ...baseOptions,
    googleDiscoveryImpl: async (...args) => {
      events.push("discovery");
      return canaryDiscovery(...args);
    },
    fetchImpl: async (_url, init) => {
      events.push("structured");
      structuredCalls += 1;
      assert.ok(init.body.includes(identityPassage), "the retained identity passage reaches the single Grid request");
      return singleCallResponse();
    },
    documentFetchImpl: async (url) => {
      events.push(`document-open:${url}`);
      return substantiveHtmlResponse(identityPassage, url);
    },
  });
  assert.deepEqual(events, [
    "discovery",
    `document-open:${candidate.url}`,
    "structured",
  ]);
  assert.equal(structuredCalls, 1);
  assert.equal(accepted.researchAudit.providerRequestCount, 2);
  assert.equal(accepted.researchAudit.providerAttempts.filter((attempt) => attempt.categoryId === "grid").length, 1);
  assert.equal(accepted.researchAudit.providerAttempts.find((attempt) => attempt.categoryId === "grid").requestState, "completed");
  assert.equal(accepted.researchAudit.canaryIdentityGate.state, "exact-project");
  assert.equal(accepted.researchAudit.categories.find((item) => item.categoryId === "grid").providerRequestCount, 1);
  assert.equal(accepted.researchAudit.followUpCount, 0);
});

test("incidental announcement venues and nearby campuses cannot authorize canary Grid analysis", async () => {
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: { operator: "DataBank", city: "Red Oak", county: "Ellis County", state: "Texas" },
  };
  const candidate = {
    url: "https://records.example.test/incidental-red-oak",
    title: "DataBank Red Oak Campus",
    categoryIds: ["project-identity"],
    exactProject: true,
  };
  const passages = [
    "DataBank's DFW14 Base Building is in Red Oak, Ellis County, Texas; the filing does not connect it to Red Oak Campus.",
    "DataBank announced the development of a logistics warehouse with a press conference at Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of Cedar Campus near Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of a data center campus near Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of a warehouse adjacent to Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of a warehouse with a press conference at Red Oak data center campus in Red Oak, Texas.",
    "DataBank announced the development of a data center campus hosting a conference at Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of a data center campus in Red Oak, Texas, named South Creek Campus.",
    "DataBank announced the development of a data center campus in Red Oak, Texas; the development is called South Creek Campus.",
  ];
  for (const passage of passages) {
    const source = { ...candidate, accessOutcome: { state: "accessible", passage } };
    assert.equal(sourceEstablishesProjectIdentity(source, project), false, passage);
    assert.notEqual(evaluateCanaryGridIdentityGate([source], project).state, "exact-project", passage);
    let structuredCalls = 0;
    const result = await runValidatedResearch(project, {
      apiKey: "synthetic-test-key",
      req: request({}),
      categoryIds: ["grid"],
      canaryGridIdentityGate: true,
      allowGoogleFallback: false,
      allowCorrectiveRetries: false,
      allowProviderRetries: false,
      useDefaultSecConnector: false,
      researchBudgetOverrides: {
        maxProviderRequests: 2,
        maxPhysicalDocumentOpens: 8,
        maxFollowUps: 0,
        maxFollowUpsPerCategory: 0,
      },
      rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
      googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
      documentFetchImpl: async (url) => substantiveHtmlResponse(passage, url),
      fetchImpl: async () => {
        structuredCalls += 1;
        throw new Error("Incidental project wording must never authorize a provider request.");
      },
    });
    assert.equal(structuredCalls, 0, passage);
    assert.notEqual(result.researchAudit.canaryIdentityGate.state, "exact-project", passage);
    assert.notEqual(result.researchAudit.canaryIdentityGate.state, "related-facility", passage);
    assert.equal(result.researchAudit.providerAttempts.filter((a) => a.categoryId === "grid").length, 0, passage);
  }
});

test("canary Grid analysis may use a retained related-facility identity without upgrading campus scope", async () => {
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: { operator: "DataBank", city: "Red Oak", county: "Ellis County", state: "Texas" },
  };
  const candidate = {
    url: "https://records.example.test/red-oak-dfw9",
    title: "DFW9 building filing",
    categoryIds: ["project-identity"],
    exactProject: true,
  };
  const passage = "DataBank's DFW9 building is part of the Red Oak Campus in Red Oak, Ellis County, Texas.";
  let structuredCalls = 0;
  const result = await runValidatedResearch(project, {
    apiKey: "synthetic-test-key",
    req: request({}),
    categoryIds: ["grid"],
    canaryGridIdentityGate: true,
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: {
      maxProviderRequests: 2,
      maxPhysicalDocumentOpens: 8,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
    },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    documentFetchImpl: async (url) => substantiveHtmlResponse(passage, url),
    fetchImpl: async (_url, init) => {
      structuredCalls += 1;
      assert.ok(init.body.includes(passage), "the facility connection must come from the retained passage");
      assert.match(init.body, /Keep every claim scoped to the specifically named building or facility/);
      return singleCallResponse();
    },
  });
  assert.equal(structuredCalls, 1);
  assert.equal(result.researchAudit.canaryIdentityGate.state, "related-facility");
  assert.equal(result.researchAudit.canaryIdentityGate.exactProjectPassageCount, 0);
  assert.equal(result.researchAudit.canaryIdentityGate.relatedFacilityPassageCount, 1);
  assert.deepEqual(result.researchAudit.canaryIdentityGate.relatedFacilityIdentifiers, ["DFW9"]);
  assert.equal(result.researchAudit.followUpCount, 0);
});

test("enforces one gap follow-up per category and records the limit", async () => {
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      budget: {
        deadlineMs: 90_000,
        maxProviderRequests: 16,
        maxFollowUps: 8,
        maxFollowUpsPerCategory: 1,
        maxCandidatesPerCategory: 10,
        maxTotalCandidates: 80,
        maxToolCalls: 32,
      },
      retrieveCategory: async ({ attempt }) => ({
        candidates: [],
        gapDrivenFollowUp: true,
        observedQueries: [`query-${attempt}`],
      }),
    },
  );
  assert.equal(run.followUpLimitPerCategory, 1);
  assert.ok(run.followUps <= 8);
  assert.ok(Object.values(run.categoryExecutions).every((execution) => (execution.followUpCount ?? 0) <= 1));
});

test("stops the category schedule once all governed identifiers are resolved", async () => {
  let calls = 0;
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      retrieveCategory: async () => {
        calls += 1;
        return { candidates: [{ eligible: true }], resolvedEvidenceIds: RESEARCH_EVIDENCE_IDS };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(run.categoryResults.length, 1);
  assert.equal(run.resolvedEvidenceIds.length, RESEARCH_EVIDENCE_IDS.length);
});

test("finishes identity first, then issues remaining primaries concurrently and preserves failures", async () => {
  let active = 0;
  let peak = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  const runPromise = orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      concurrent: true,
      categoryIds: [
        "climate-operational-hazard",
        "electricity",
        "tenant-counterparty",
        "water",
        "permitting-community",
        "construction-capital",
        "grid",
        "project-identity",
      ],
      retrieveCategory: async ({ categoryId }) => {
        started.push(categoryId);
        if (categoryId === "project-identity") {
          return { candidates: [], observedQueries: ["observed project-identity"], toolCallCount: 1 };
        }
        active += 1;
        peak = Math.max(peak, active);
        if (started.length === 8) release();
        await gate;
        active -= 1;
        if (categoryId === "water") throw new Error("isolated category failure");
        return { candidates: [], observedQueries: [`observed ${categoryId}`], toolCallCount: 1 };
      },
    },
  );
  const run = await runPromise;
  assert.deepEqual(started, [
    "project-identity",
    "grid",
    "construction-capital",
    "permitting-community",
    "water",
    "tenant-counterparty",
    "electricity",
    "climate-operational-hazard",
  ]);
  assert.equal(peak, 7);
  assert.equal(run.providerRequests, 8);
  assert.equal(run.categoryExecutions.water.state, "Provider failure");
  assert.equal(Object.keys(run.categoryExecutions).length, 8);
  assert.ok(run.toolCalls <= 32);
});

test("identity document work precedes remaining primary provider opportunities", async () => {
  const events = [];
  let issued = 0;
  let releaseProviders;
  const providersIssued = new Promise((resolve) => { releaseProviders = resolve; });
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Arizona" },
    {
      concurrent: true,
      retrieveCategory: async ({ categoryId }) => {
        events.push(`provider:${categoryId}`);
        if (categoryId === "project-identity") {
          events.push(`document:${categoryId}`);
          return { candidates: [], providerRequestCount: 1 };
        }
        issued += 1;
        if (issued === 7) releaseProviders();
        await providersIssued;
        events.push(`document:${categoryId}`);
        return { candidates: [], providerRequestCount: 1 };
      },
    },
  );
  assert.equal(run.providerRequests, 8);
  assert.deepEqual(events.slice(0, 2), ["provider:project-identity", "document:project-identity"]);
  assert.equal(events.slice(2, 9).every((event) => event.startsWith("provider:")), true);
  assert.ok(Object.values(run.categoryExecutions).every((execution) => execution.issuedPrimaryQuery));
});

test("categories skipped by the provider budget remain NOT RUN and SEARCH INCOMPLETE", async () => {
  const project = { name: "Atlas", location: "Arizona" };
  const plan = buildResearchCategoryPlan(project);
  const started = [];
  const run = await orchestrateCategoryResearch(project, {
    budget: { ...RESEARCH_RUN_BUDGET, maxProviderRequests: 1 },
    retrieveCategory: async ({ categoryId }) => {
      started.push(categoryId);
      return {
        candidates: [],
        observedQueries: [`observed ${categoryId}`],
        providerRequestCount: 1,
      };
    },
  });
  assert.deepEqual(started, ["project-identity"]);

  const audit = buildResearchAudit({
    project,
    coverage: { categoryExecutions: run.categoryExecutions },
    sources: [],
    evidence: [],
  });
  for (const category of plan.categories.slice(1)) {
    const recorded = audit.categories.find((item) => item.categoryId === category.categoryId);
    assert.equal(recorded.executionOutcome, "not-run");
    assert.equal(recorded.analysisOutcome, "not-run");
    assert.equal(recorded.notRunReason, "provider-request-budget");
    assert.equal(recorded.state, "Not searched");
    assert.equal(recorded.searchCompleteness, "incomplete");
    assert.equal(recorded.searchCompletenessLabel, "SEARCH INCOMPLETE");
  }
});

test("malformed repairs consume request slots and cannot displace reserved primaries", async () => {
  const attempts = [];
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Ohio" },
    {
      concurrent: true,
      budget: { ...RESEARCH_RUN_BUDGET, maxProviderRequests: 10 },
      retrieveCategory: async ({ categoryId, authorizeAdditionalProviderRequest }) => {
        attempts.push(`${categoryId}:primary`);
        let providerRequestCount = 1;
        if (authorizeAdditionalProviderRequest()) {
          attempts.push(`${categoryId}:repair`);
          providerRequestCount += 1;
        }
        return { candidates: [], providerRequestCount };
      },
    },
  );
  assert.equal(attempts.filter((attempt) => attempt.endsWith(":primary")).length, 8);
  assert.equal(attempts.filter((attempt) => attempt.endsWith(":repair")).length, 2);
  assert.equal(run.providerRequests, 10);
  assert.ok(Object.values(run.categoryExecutions).every((execution) => execution.state !== "Not searched"));
});

test("an issued primary without an observed provider search is not labeled Not searched", () => {
  const plan = buildResearchCategoryPlan({ name: "Atlas", location: "Arizona" });
  const first = plan.categories[0];
  const audit = buildResearchAudit({
    project: { name: "Atlas", location: "Arizona" },
    coverage: {
      categoryExecutions: {
        [first.categoryId]: {
          issuedPrimaryQuery: first.requestedPrimaryQuery,
          state: "Not searched",
          providerRequestCount: 1,
        },
      },
    },
    sources: [],
    evidence: [],
  });
  assert.equal(audit.categories[0].state, "No eligible evidence");
  assert.equal(audit.categories[0].stageCounts.issuedProviderRequests, 1);
  assert.equal(audit.categories[0].stageCounts.observedSearches, 0);
});

test("propagates client cancellation distinctly from the deadline timeout", async () => {
  const controller = new AbortController();
  await assert.rejects(
    orchestrateCategoryResearch(
      { name: "Atlas", location: "Texas" },
      {
        signal: controller.signal,
        retrieveCategory: async () => {
          controller.abort();
          return { candidates: [] };
        },
      },
    ),
    (error) => {
      assert.equal(error.name, "ResearchCancelledError");
      assert.equal(classifyResearchFailure(error).type, "cancelled");
      assert.equal(classifyResearchFailure(error).status, 499);
      return true;
    },
  );
});

test("stops physical document opens at the hard ceiling and records budget-limited categories", async () => {
  let calls = 0;
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      retrieveCategory: async () => {
        calls += 1;
        return {
          candidates: [],
          gapDrivenFollowUp: true,
          physicalOpenBudgetExceeded: true,
        };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(run.physicalOpenBudgetExceeded, true);
  assert.equal(run.categoryExecutions.grid.followUpSkipReason, "physical-open-budget");
  assert.equal(run.categoryExecutions.electricity.followUpSkipReason, "physical-open-budget");
});

test("enforces the 24-document ceiling in a provider and document fixture", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-physical-open-test-"));
  let providerCalls = 0;
  let documentCalls = 0;
  const discoverySources = Array.from({ length: 30 }, (_, index) => ({
    ...retrievedSource,
    url: `https://fixture.example/rainier/${index}`,
    title: `Project Rainier fixture document ${index}`,
    categoryIds: [[
      "project-identity", "grid", "electricity", "water",
      "permitting-community", "construction-capital", "tenant-counterparty",
      "climate-operational-hazard",
    ][index % 8]],
  }));
  const response = responseRecorder();
  await handleResearchProjectRequest(request({
    name: "Project Rainier",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery(discoverySources),
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async () => {
      const start = providerCalls * 10;
      providerCalls += 1;
      const sources = Array.from({ length: 10 }, (_, index) => ({
        ...retrievedSource,
        url: `https://fixture.example/rainier/${start + index}`,
        title: `Project Rainier fixture document ${start + index}`,
        categoryIds: ["project-identity"],
      }));
      return singleCallResponse(validResearchResponse(), sources);
    },
    documentFetchImpl: async (url) => {
      documentCalls += 1;
      return substantiveHtmlResponse("Project Rainier fixture passage.", url);
    },
  });
  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(documentCalls, 24);
  assert.equal(payload.researchCoverage.physicalOpenBudget, 24);
  assert.equal(payload.researchCoverage.physicalOpensUsed, 24);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  assert.equal(payload.researchAudit.physicalOpenBudgetExceeded, true);
  assert.ok(payload.researchAudit.categories.some((category) => category.followUpSkipReason === "physical-open-budget" || category.state === "Not searched"));
});

test("does not let blocked, source-free, or overlapping follow-ups erase an accessible claim", () => {
  const project = { name: "Project Atlas", location: "Texas", knownData: null };
  const primaryUrl = "https://example.gov/grid/primary";
  const primaryResearch = categoryMappedResearch("electricity_cost", primaryUrl, 42);
  const primaryResult = {
    categoryId: "grid",
    research: primaryResearch,
    sources: [categorySource(primaryUrl)],
    coverage: { searchedDomains: ["grid"] },
  };

  const blockedUrl = "https://example.gov/grid/blocked";
  const blockedResearch = categoryMappedResearch("electricity_cost", blockedUrl, 99);
  const blockedMerge = mergeCategoryResearchResults(project, [
    primaryResult,
    {
      categoryId: "grid",
      research: blockedResearch,
      sources: [categorySource(blockedUrl, "blocked")],
      coverage: { searchedDomains: ["grid"] },
    },
  ]);
  assert.equal(blockedMerge.evidence.find((item) => item.id === "electricity_cost").sourceUrl, primaryUrl);

  const sourceFreeResearch = validResearchResponse();
  const sourceFreeMerge = mergeCategoryResearchResults(project, [
    primaryResult,
    {
      categoryId: "grid",
      research: sourceFreeResearch,
      sources: [],
      coverage: { searchedDomains: ["grid"] },
    },
  ]);
  assert.equal(sourceFreeMerge.evidence.find((item) => item.id === "electricity_cost").sourceUrl, primaryUrl);

  const overlappingLaterMerge = mergeCategoryResearchResults(project, [
    primaryResult,
    {
      categoryId: "electricity",
      research: sourceFreeResearch,
      sources: [],
      coverage: { searchedDomains: ["electricity"] },
    },
  ]);
  assert.equal(overlappingLaterMerge.evidence.find((item) => item.id === "electricity_cost").sourceUrl, primaryUrl);
});

test("enforces the run-wide tool-call budget across category requests", async () => {
  let calls = 0;
  const run = await orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      budget: {
        deadlineMs: 90_000,
        maxProviderRequests: 16,
        maxFollowUps: 1,
        maxCandidatesPerCategory: 10,
        maxTotalCandidates: 80,
        maxToolCalls: 3,
      },
      retrieveCategory: async () => {
        calls += 1;
        return {
        candidates: [],
        toolCallCount: 2,
        gapDrivenFollowUp: true,
        };
      },
    },
  );
  assert.equal(run.toolCalls, 3);
  assert.equal(run.toolCallBudgetExceeded, true);
  assert.equal(run.categoryResults.length, 2);
  assert.equal(calls, 2);
  assert.equal(run.categoryExecutions.water.state, "Timed out");
  assert.equal(run.categoryExecutions.water.executedQueries.length, 0);
});

test("records category counts and gaps without copying a query to every category", () => {
  const audit = buildResearchAudit({
    project: { name: "Atlas", location: "Texas" },
    coverage: { searchTerms: ['"Atlas" "Texas" utility tariff electricity rate power price $/MWh'], toolCallCount: 1 },
    sources: [],
    evidence: [],
  });
  assert.equal(audit.categories.length, 8);
  assert.equal(audit.categories.find((category) => category.categoryId === "electricity").executedQueries.length, 1);
  assert.equal(audit.categories.filter((category) => category.executedQueries.length === 0).length, 7);
  assert.ok(audit.categoryGaps.includes("water"));
});

test("marks a category complete only when every category evidence item is eligible", () => {
  const grid = buildResearchCategoryPlan({ name: "Atlas", location: "Texas" }).categories.find((category) => category.categoryId === "grid");
  const sources = grid.evidenceIds.map((id) => ({
    url: `https://example.gov/${id}`,
    searchDomain: "grid",
    sourceState: "retained",
    accessOutcome: { state: "accessible" },
    parsingState: "parsed",
  }));
  const eligibleEvidence = grid.evidenceIds.map((id) => ({ id, eligibleForModel: true }));
  const complete = buildResearchAudit({
    project: { name: "Atlas", location: "Texas" },
    coverage: { categoryExecutions: { grid: { executedQueries: [grid.requestedPrimaryQuery] } } },
    sources,
    evidence: eligibleEvidence,
  });
  const completeGrid = complete.categories.find((category) => category.categoryId === "grid");
  assert.equal(completeGrid.state, "Complete");
  assert.deepEqual(completeGrid.unresolvedGaps, []);

  const partial = buildResearchAudit({
    project: { name: "Atlas", location: "Texas" },
    coverage: { categoryExecutions: { grid: { executedQueries: [grid.requestedPrimaryQuery] } } },
    sources,
    evidence: eligibleEvidence.slice(0, -1),
  });
  const partialGrid = partial.categories.find((category) => category.categoryId === "grid");
  assert.equal(partialGrid.state, "Partial");
  assert.ok(partialGrid.unresolvedGaps.includes(grid.evidenceIds.at(-1)));

  const identity = buildResearchAudit({
    project: { name: "Atlas", location: "Texas" },
    coverage: { categoryExecutions: { "project-identity": { executedQueries: ["Atlas identity filing"] } } },
    sources: [],
    evidence: [],
  }).categories.find((category) => category.categoryId === "project-identity");
  assert.equal(identity.state, "No eligible evidence");
  assert.deepEqual(identity.unresolvedGaps, ["project-identity"]);
});

test("keeps identity-discovery receipts in the audit without making identity metadata evidence", () => {
  const identityUrl = "https://records.example.gov/atlas/identity";
  const audit = buildResearchAudit({
    project: { name: "Atlas", location: "Taylor County, Texas" },
    coverage: {
      categoryExecutions: {
        "project-identity": { executedQueries: ["Atlas identity filing"] },
      },
    },
    sources: [{
      url: identityUrl,
      originalUrl: identityUrl,
      searchDomain: "web-search",
      sourceRole: "facility identity",
      identityRole: "facility identity",
      exactProject: true,
      sourceState: "retained",
      accessOutcome: {
        state: "accessible",
        reason: "retrieved",
        physicalOpenIndex: 1,
        passage: "Atlas identity filing names the exact facility.",
      },
    }],
    evidence: [],
  });
  const identity = audit.categories.find((category) => category.categoryId === "project-identity");
  assert.equal(identity.state, "Partial");
  assert.equal(identity.stageCounts.allEvidenceEligible, false);
  assert.equal(identity.openedDocuments.length, 1);
  assert.deepEqual(identity.openedDocuments[0], {
    sourceChannel: "provider",
    originalUrl: identityUrl,
    referringUrls: [identityUrl],
    resolvedUrl: identityUrl,
    canonicalUrl: identityUrl,
    opened: true,
    attempted: true,
    physicalOpenIndex: 1,
    reusedReceipt: false,
    reusedFromCanonicalUrl: null,
    accessState: "accessible",
    accessOutcome: "retrieved",
    redirectHops: [],
    fetchMetrics: null,
    transportDiagnostic: null,
    extractionMethod: null,
    extractionOutcome: null,
    contentHash: null,
    retainedPassage: "Atlas identity filing names the exact facility.",
    extractionLimitations: [],
    categoryId: "project-identity",
    categoryLabel: "Project identity",
    identityRole: "facility identity",
  });
  assert.deepEqual(identity.evidenceIds, []);
});

test("uses collision-resistant normalized project cache keys and deterministic age tiers", () => {
  assert.equal(
    researchProjectCacheKey({ name: " Project Atlas ", location: "TEXAS" }),
    researchProjectCacheKey({ name: "project   atlas", location: "texas" }),
  );
  assert.notEqual(
    researchProjectCacheKey({ name: "Project Atlas", location: "Texas" }),
    researchProjectCacheKey({ name: "Project Atlas", location: "Virginia" }),
  );
  const firstIdentity = {
    projectId: "atlas-facility-1",
    providerId: "compute-atlas-1",
    name: "Project Atlas",
    location: "Texas",
    operator: "Atlas Compute",
  };
  assert.notEqual(
    researchProjectCacheKey({ name: "Project Atlas", location: "Texas", projectIdentity: firstIdentity }),
    researchProjectCacheKey({
      name: "Project Atlas",
      location: "Texas",
      projectIdentity: { ...firstIdentity, projectId: "atlas-facility-2", providerId: "compute-atlas-2" },
    }),
  );
  assert.equal(
    researchProjectCacheKey({ name: "Atlas", location: "Texas" }),
    researchProjectCacheKey({
      name: "Atlas",
      location: "Texas",
      projectIdentity: { projectId: null, providerId: null, name: "Atlas", location: "Texas", operator: null },
    }),
  );
  const now = Date.parse("2026-09-03T12:00:00.000Z");
  assert.equal(classifyResearchCacheAge("2026-09-03T10:00:00.000Z", now), "fresh");
  assert.equal(classifyResearchCacheAge("2026-09-03T00:00:00.000Z", now), "recent");
  assert.equal(classifyResearchCacheAge("2026-09-01T00:00:00.000Z", now), "stale");
  assert.equal(classifyResearchCacheAge("2026-08-01T00:00:00.000Z", now), "expired");
});

test("atomically retains validated results and deduplicates concurrent refreshes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-cache-test-"));
  const cache = createResearchProjectCache({ directory });
  const key = cache.keyFor({ name: "Atlas", location: "Texas" });
  let runs = 0;
  const runner = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { projectSummary: { name: "Atlas" }, evidence: [] };
  };
  const first = cache.refresh(key, runner);
  const second = cache.refresh(key, runner);
  assert.equal(first.started, true);
  assert.equal(second.started, false);
  const [left, right] = await Promise.all([first.promise, second.promise]);
  assert.equal(runs, 1);
  assert.deepEqual(left, right);
  cache.clearMemory();
  assert.deepEqual(await cache.read(key), left);
});

test("serves fresh cached research without another provider call", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-handler-cache-"));
  const cache = createResearchProjectCache({ directory });
  let providerCalls = 0;
  const options = {
    apiKey: "server-secret-for-test",
    googleApiKey: null,
    cache,
    fetchImpl: async () => {
      providerCalls += 1;
      return singleCallResponse();
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse("Project Atlas public filing.", url),
  };
  const first = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Cached Atlas", location: "Texas" }), first, options);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().researchCache.state, "updated");
  const second = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Cached Atlas", location: "Texas" }), second, options);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().researchCache.state, "fresh");
  assert.equal(providerCalls, 1);
});

test("echoes the exact selected identity from a cached research response", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-identity-cache-"));
  const cache = createResearchProjectCache({ directory });
  const project = parseResearchProjectBody({
    name: "QTS Irving 1",
    location: "Irving, Texas",
    projectIdentity: {
      projectId: "qts-irving-1",
      providerId: "compute-atlas-qts-irving-1",
      name: "QTS Irving 1",
      location: "Irving, Texas",
      operator: "QTS Data Centers",
    },
    knownData: {
      providerId: "compute-atlas-qts-irving-1",
      operator: "QTS Data Centers",
    },
  });
  const result = containResearchResult({
    ...validResearchResponse(),
    projectSummary: {
      ...validResearchResponse().projectSummary,
      name: project.name,
      location: project.location,
    },
    projectIdentity: project.projectIdentity,
  });
  await cache.write(cache.keyFor(project), result);

  const response = responseRecorder();
  await handleResearchProjectRequest(request(project), response, { cache });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().projectIdentity, project.projectIdentity);
  assert.equal(response.json().researchCache.state, "fresh");
});

test("retains physical-open diagnostics through a cached handoff", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-cache-budget-handoff-"));
  const cache = createResearchProjectCache({ directory });
  const project = { name: "Budget Atlas", location: "Texas" };
  const cached = containResearchResult({
    ...validResearchResponse(),
    researchCoverage: {
      searchedDomains: [],
      failedDomains: [],
      retrievedSourceCount: 3,
      searchTerms: [],
      searchTermsSource: "unavailable",
      physicalOpenBudget: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
      physicalOpensUsed: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
      physicalOpensRemaining: 0,
      physicalOpenBudgetExceeded: true,
    },
    researchAudit: {
      provider: "openai",
      model: "gpt-4o",
      physicalOpenBudget: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
      physicalOpensUsed: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
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
  });
  await cache.write(cache.keyFor(project), cached);
  cache.clearMemory();

  const response = responseRecorder();
  await handleResearchProjectRequest(request(project), response, { cache, apiKey: "unused" });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.researchCache.state, "fresh");
  assert.equal(payload.researchCoverage.physicalOpensUsed, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpensRemaining, 0);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  assert.equal(payload.researchAudit.physicalOpenBudgetExceeded, true);
  assert.equal(payload.researchAudit.categories[0].followUpSkipReason, "physical-open-budget");
  assert.equal(payload.researchAudit.categories[0].stageCounts.notAttempted, 3);
});

test("recontains a cached result instead of trusting prior acceptance", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-cache-policy-"));
  const cache = createResearchProjectCache({ directory });
  const project = { name: "Cached Atlas", location: "Texas" };
  const cached = containResearchResult(validResearchResponse());
  cached.evidence[0] = {
    ...cached.evidence[0],
    acceptedForModel: true,
    researchState: "accepted",
    eligibleForModel: true,
  };
  await cache.write(cache.keyFor(project), cached);
  const response = responseRecorder();
  await handleResearchProjectRequest(request(project), response, { cache, apiKey: "unused" });
  const result = response.json();
  assert.equal(result.researchCache.state, "fresh");
  assert.equal(result.evidence[0].acceptedForModel, false);
  assert.notEqual(result.evidence[0].researchState, "accepted");
});

test("same-location sources without project identity remain ineligible", () => {
  const genericSource = {
    ...retrievedSource,
    title: "Taylor County utility filing",
    excerpt: "A generic facility filing for Taylor County, Texas.",
  };
  const parsed = parseResearchResponse(validResearchResponse(), [genericSource]);
  assert.equal(parsed.eligibleEvidence?.length, 0);
  assert.equal(parsed.researchMode, "research-incomplete");
});

test("keeps stale research available when a forced refresh exhausts provider quota", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-stale-cache-"));
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const cache = createResearchProjectCache({ directory, now: () => now });
  const project = { name: "Quota Atlas", location: "Texas" };
  await cache.write(cache.keyFor(project), parseResearchResponse(validResearchResponse(), [retrievedSource]));
  now += 2 * 24 * 60 * 60 * 1000;
  const response = responseRecorder();
  await handleResearchProjectRequest(request({ ...project, forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    cache,
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: "Billing allocation reached.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    }), { status: 429, headers: { "content-type": "application/json" } }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().researchCache.state, "stale");
  assert.equal(response.json().researchCache.providerAvailable, false);
  assert.equal(response.json().researchCache.errorType, "quota-exhausted");
  assert.equal(response.json().evidence.length, 16);
  assert.doesNotMatch(response.body, /private quota detail/i);
});

test("classifies only an explicit provider quota code as quota exhaustion", async () => {
  await assert.rejects(
    researchProjectWithWebSearch(
      { name: "Quota Atlas", location: "Texas" },
      "server-secret-for-test",
      async () => new Response(JSON.stringify({
        error: {
          message: "Billing allocation reached.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      }), {
        status: 429,
        headers: { "content-type": "application/json", "x-request-id": "req_quota_123" },
      }),
    ),
    (error) => {
      const failure = classifyResearchFailure(error);
      assert.equal(failure.type, "quota-exhausted");
      assert.equal(failure.providerDiagnostic.upstreamStatus, 429);
      assert.equal(failure.providerDiagnostic.errorCode, "insufficient_quota");
      assert.equal(failure.providerDiagnostic.errorType, "insufficient_quota");
      assert.equal(failure.providerDiagnostic.requestId, "req_quota_123");
      return true;
    },
  );
});

test("distinguishes temporary provider rate limiting and retains bounded indicators", async () => {
  await assert.rejects(
    researchProjectWithWebSearch(
      { name: "Rate Atlas", location: "Arizona" },
      "server-secret-for-test",
      async () => new Response(JSON.stringify({
        error: {
          message: "Please retry later.",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "12",
          "x-ratelimit-remaining-requests": "0",
          "x-ratelimit-reset-requests": "12s",
        },
      }),
    ),
    (error) => {
      const failure = classifyResearchFailure(error);
      assert.equal(failure.type, "provider-rate-limit");
      assert.equal(failure.providerDiagnostic.errorCode, "rate_limit_exceeded");
      assert.deepEqual(failure.providerDiagnostic.rateLimit, {
        retryAfter: "12",
        remainingRequests: "0",
        resetRequests: "12s",
      });
      return true;
    },
  );
});

test("keeps unknown or malformed provider 429 responses distinct and redacted", async () => {
  await assert.rejects(
    researchProjectWithWebSearch(
      { name: "Unknown Atlas", location: "Ohio" },
      "server-secret-for-test",
      async () => new Response(
        "temporary condition for org-privateOwner user@example.com authorization: Bearer sk-secret-value token=private-token",
        { status: 429, headers: { "x-request-id": "req_unknown_456" } },
      ),
    ),
    (error) => {
      const failure = classifyResearchFailure(error);
      assert.equal(failure.type, "provider-429");
      assert.equal(failure.providerDiagnostic.requestId, "req_unknown_456");
      assert.match(failure.providerDiagnostic.message, /\[redacted\]/);
      assert.doesNotMatch(JSON.stringify(failure), /sk-secret-value|private-token|org-privateOwner|user@example.com/);
      assert.equal(failure.providerDiagnostic.errorCode, undefined);
      return true;
    },
  );
});

test("exposes observable completion status for a background stale refresh", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-status-cache-"));
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const cache = createResearchProjectCache({ directory, now: () => now });
  const project = { name: "Status Atlas", location: "Texas" };
  const key = cache.keyFor(project);
  await cache.write(key, parseResearchResponse(validResearchResponse(), [retrievedSource]));
  now += 2 * 24 * 60 * 60 * 1000;
  const stale = responseRecorder();
  await handleResearchProjectRequest(request(project), stale, {
    apiKey: "server-secret-for-test",
    cache,
    fetchImpl: async () => singleCallResponse(),
    documentFetchImpl: async (url) => substantiveHtmlResponse("Project Atlas public filing.", url),
  });
  assert.equal(stale.json().researchCache.refreshStatus, "running");
  let status;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = responseRecorder();
    await handleResearchProjectRequest({ method: "GET", url: `/api/research-project?cacheKey=${key}` }, status, { cache });
    if (status.json().researchCache.refreshStatus === "completed") break;
  }
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().researchCache.refreshStatus, "completed");
  assert.equal(status.json().result.evidence.length, 16);
});

test("live-like unlabeled retained passages survive the production analysis packet boundary", async () => {
  const project = { name: "Cedar Campus", location: "Goodyear, Arizona", knownData: { operator: "Cedar Compute" } };
  const passage = "Cedar Compute operates Cedar Campus in Goodyear, Arizona. The project has a closed loop air-cooled water system, a planned grid interconnection and three separate construction phases. The public record does not disclose any electricity tariff or financing amount.";
  const sources = [{
    url: "https://records.example.gov/cedar",
    categoryIds: [],
    categoryRoutingUnknown: true,
    accessOutcome: { state: "accessible", passage },
  }];
  for (const categoryId of ["project-identity", "grid", "water"]) {
    const trace = createResearchFunnelDiagnostics();
    let issued = 0;
    await researchProjectWithWebSearch(project, "offline-only", async (_url, init) => {
      issued += 1;
      assert.ok(init.body.includes(passage), `unresolved citation routing must not erase retained ${categoryId} context`);
      return singleCallResponse();
    }, undefined, { categoryId, evidenceIds: [], groundedSources: sources, webSearchEnabled: false, claimTrace: trace.claimTrace });
    assert.equal(issued, 1);
    assert.equal(trace.toJSON().analysisPackets[0].passages.length, 1);
  }
});

test("recognized mixed citation labels still exclude other-category passages after unresolved-routing repair", async () => {
  const passage = "Cedar Campus has a water cooling agreement; this public document concerns water supply only and does not disclose any power tariff, interconnection milestone, or electricity cost.";
  let body;
  await researchProjectWithWebSearch({ name: "Cedar Campus", location: "Arizona" }, "offline-only", async (_url, init) => {
    body = init.body;
    return singleCallResponse();
  }, undefined, {
    categoryId: "grid", evidenceIds: ["grid_interconnection"], webSearchEnabled: false,
    groundedSources: [{ url: "https://records.example.gov/water", categoryIds: ["water", "unknown"],
      categoryRoutingUnknown: false, accessOutcome: { state: "accessible", passage } }],
  });
  assert.ok(!body.includes(passage), "recognized water scope must not broaden to Grid");
});

test("replays one run for a repeated request identity and assigns an explicit retry a new run ID", async () => {
  let discoveryCalls = 0;
  const cache = createResearchProjectCache();
  const options = {
    apiKey: null,
    googleApiKey: null,
    retrievalOnly: true,
    cache,
    googleDiscoveryImpl: async () => {
      discoveryCalls += 1;
      return {
        status: "completed",
        candidates: [],
        queries: [],
        urlCitationCount: 0,
        rawAnnotationSummaries: [],
        usableCitationMetadataPresent: false,
        groundingSearchExecuted: false,
      };
    },
  };
  const project = {
    name: "Request Identity Offline Fixture",
    location: "Texas",
    retrievalOnly: true,
    requestId: "request-identity-one-click",
    initiator: "user-action",
  };
  const firstResponse = responseRecorder();
  await handleResearchProjectRequest({
    ...request(project),
    ip: "198.51.100.201",
  }, firstResponse, options);
  const firstBody = firstResponse.json();

  const duplicateResponse = responseRecorder();
  await handleResearchProjectRequest({
    ...request(project),
    ip: "198.51.100.202",
  }, duplicateResponse, options);
  const duplicateBody = duplicateResponse.json();

  assert.equal(discoveryCalls, 1);
  assert.equal(duplicateBody.researchAudit.runCorrelationId, firstBody.researchAudit.runCorrelationId);
  assert.equal(duplicateBody.researchCache.runId, firstBody.researchCache.runId);
  assert.equal(duplicateBody.researchAudit.initiator, "user-action");
  assert.equal(duplicateBody.researchAudit.requestId, "request-identity-one-click");
  assert.equal(firstBody.researchAudit.funnelDiagnostics.captureMode, "request-local-observed-bounded");
  assert.deepEqual(duplicateBody.researchAudit.funnelDiagnostics, firstBody.researchAudit.funnelDiagnostics,
    "request replay must reuse the same capture rather than creating another collector");

  const retryResponse = responseRecorder();
  await handleResearchProjectRequest({
    ...request({
      ...project,
      forceRefresh: true,
      requestId: "request-identity-explicit-retry",
      initiator: "user-retry",
    }),
    ip: "198.51.100.203",
  }, retryResponse, options);
  const retryBody = retryResponse.json();
  assert.equal(discoveryCalls, 2);
  assert.notEqual(retryBody.researchAudit.runCorrelationId, firstBody.researchAudit.runCorrelationId);
  assert.equal(retryBody.researchAudit.initiator, "user-retry");
  assert.equal(retryBody.researchAudit.requestId, "request-identity-explicit-retry");
});

test("a repeated stale-cache action reuses its explicitly marked background run", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const cache = createResearchProjectCache({ now: () => now });
  const project = { name: "Stale Request Identity Fixture", location: "Texas" };
  const cacheKey = cache.keyFor(project);
  await cache.write(cacheKey, parseResearchResponse(validResearchResponse(), [retrievedSource]));
  now += 2 * 24 * 60 * 60 * 1000;
  let admissionChecks = 0;
  const options = {
    apiKey: "offline-fixture-key",
    googleApiKey: null,
    cache,
    rateLimiter: {
      allow() {
        admissionChecks += 1;
        return { allowed: false, retryAfterSeconds: 1 };
      },
    },
  };
  const body = {
    ...project,
    requestId: "stale-request-identity-fixture",
    initiator: "user-action",
  };
  const staleResponse = responseRecorder();
  await handleResearchProjectRequest({
    ...request(body),
    ip: "198.51.100.204",
  }, staleResponse, options);
  const firstRunId = staleResponse.json().researchCache.runId;
  assert.ok(firstRunId);
  assert.equal(staleResponse.json().researchCache.initiator, "background-refresh");

  const duplicateResponse = responseRecorder();
  await handleResearchProjectRequest({
    ...request(body),
    ip: "198.51.100.205",
  }, duplicateResponse, options);
  assert.equal(duplicateResponse.statusCode, 429);
  assert.equal(admissionChecks, 1);

  const status = responseRecorder();
  await handleResearchProjectRequest({
    method: "GET",
    url: `/api/research-project?cacheKey=${cacheKey}`,
  }, status, { cache });
  assert.equal(status.json().researchCache.refreshStatus, "failed");
  assert.equal(status.json().researchCache.runId, firstRunId);
  assert.equal(status.json().researchCache.initiator, "background-refresh");
  assert.equal(status.json().researchCache.requestId, body.requestId);
});

test("validates and preserves optional Compute Atlas known data", () => {
  assert.deepEqual(parseResearchProjectBody({
    name: "Atlas",
    location: "Texas",
    knownData: {
      capacity: 840,
      operator: " Atlas Compute ",
      status: "Planned",
      sourceUrl: "https://example.com/directory/atlas",
      cityDomains: ["city.example", "localhost", "city.example"],
      countyDomains: ["county.example"],
      utilityDomains: ["utility.example"],
      economicDevelopmentDomains: ["invest.example"],
      knownOfficialEndpoints: ["https://records.example/api/projects", "http://127.0.0.1/private"],
      ignored: "not allowed through",
    },
  }), {
    name: "Atlas",
    location: "Texas",
    projectIdentity: {
      projectId: null,
      providerId: null,
      name: "Atlas",
      location: "Texas",
      operator: "Atlas Compute",
    },
    knownData: {
      capacity: 840,
      operator: "Atlas Compute",
      status: "Planned",
      sourceUrl: "https://example.com/directory/atlas",
      cityDomains: ["city.example"],
      countyDomains: ["county.example"],
      utilityDomains: ["utility.example"],
      economicDevelopmentDomains: ["invest.example"],
      knownOfficialEndpoints: ["https://records.example/api/projects"],
    },
  });
  assert.throws(() => parseResearchProjectBody({ name: "Atlas", location: "Texas", knownData: "bad" }), /knownData/);
  assert.throws(() => parseResearchProjectBody({
    name: "Atlas",
    location: "Texas",
    projectIdentity: {
      projectId: "other-project",
      providerId: null,
      name: "Different project",
      location: "Texas",
      operator: null,
    },
  }), /identity does not match/i);
});

test("preserves validated owner/operator aliases and facility identifiers as discovery context", () => {
  const result = parseResearchProjectBody({
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: {
      operatorAliases: ["DataBank", " DataBank "],
      ownerAliases: ["DataBank", "Digital Realty"],
      facilityIdentifiers: ["DFW9", "DFW10", "DFW9"],
    },
  });
  assert.deepEqual(result.knownData, {
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
    operatorAliases: ["DataBank"],
    ownerAliases: ["DataBank", "Digital Realty"],
    facilityIdentifiers: ["DFW9", "DFW10"],
  });
});

test("validates focused unresolved evidence requests and current evidence context", () => {
  assert.deepEqual(parseResearchProjectBody({
    name: "Atlas",
    location: "Texas",
    focusIds: ["grid_interconnection", "water_rights", "grid_interconnection"],
    currentEvidence: [{
      id: "grid_interconnection",
      label: "Grid Interconnection Timeline",
      value: "Not established",
      classification: "Missing Evidence",
      citation: "No validated source.",
    }],
  }), {
    name: "Atlas",
    location: "Texas",
    projectIdentity: {
      projectId: null,
      providerId: null,
      name: "Atlas",
      location: "Texas",
      operator: null,
    },
    focusIds: ["grid_interconnection", "water_rights"],
    currentEvidence: [{
      id: "grid_interconnection",
      label: "Grid Interconnection Timeline",
      value: "Not established",
      classification: "Missing Evidence",
      citation: "No validated source.",
    }],
  });
  assert.throws(() => parseResearchProjectBody({
    name: "Atlas",
    location: "Texas",
    focusIds: ["not_a_modeled_input"],
  }), /unknown evidence identifier/i);
});

test("grounds the prompt in known data without treating it as SafeLoc evidence", () => {
  const prompt = buildResearchProjectPrompt({
    name: "Atlas",
    location: "Texas",
    knownData: {
      capacity: 840,
      operator: "Atlas Compute",
      status: "Planned",
      sourceUrl: "https://directory.example/projects/atlas",
    },
  }, [retrievedSource]);
  assert.match(prompt, /Compute Atlas public database/);
  assert.match(prompt, /not as SafeLoc evidence or verified project economics/);
  assert.doesNotMatch(prompt, /using only the retrieved sources/i);
  assert.match(prompt, /Management Assertion or lower/);
  assert.match(prompt, /no more than 32 targeted queries overall/i);
  assert.match(prompt, /no minimum finding quota/i);
  assert.match(prompt, /Planned/);
  assert.match(prompt, /https:\/\/directory\.example\/projects\/atlas/);
  assert.doesNotMatch(prompt, /site:directory\.example/);
});

test("builds two bounded, metadata-grounded query angles for every modeled variable", () => {
  const plan = buildVariableQueryPlan({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    knownData: {
      operator: "Atlas Compute",
      status: "Planned",
      sourceUrl: "https://directory.example/projects/atlas",
    },
    focusIds: ["water_rights"],
  });
  assert.match(plan.split("\n")[0], /water_rights/);
  for (const id of RESEARCH_EVIDENCE_IDS) {
    assert.equal(RESEARCH_QUERY_ANGLES[id].length, 2);
    assert.match(plan, new RegExp(`- ${id} \\(maximum 2 queries\\):`));
  }
  assert.match(plan, /"Project Atlas" "Taylor County, Texas" utility tariff/);
  assert.match(plan, /"Atlas Compute" "Project Atlas" filed energy contract/);
  assert.doesNotMatch(plan, /"Planned"|site:directory\.example/);
  assert.equal(plan.split("\n").length, 16);
});

test("normalizes and caps sources returned by the single web-search response", () => {
  const retrieval = normalizeRetrievedSources({
    output: [{ type: "web_search_call", action: { sources: Array.from({ length: 12 }, (_, index) => ({
      url: `https://example.com/search/${index}`,
      title: `Result ${index}`,
    })) } }],
  });
  assert.equal(retrieval.length, 10);
});

test("retains Arizona citation-only URLs and deduplicates unsafe provider channels", () => {
  const citationUrl = "https://www.azwater.gov/project-wintersburg/permit?id=313";
  const retrieval = normalizeRetrievedSources({
    sources: [
      { url: "http://127.0.0.1/private", title: "Unsafe structured source" },
      { title: "Missing structured URL" },
    ],
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: "{}",
        annotations: [
          { type: "url_citation", url: citationUrl, title: "Wintersburg permit 313" },
          { type: "url_citation", url: citationUrl, title: "Duplicate Wintersburg permit" },
          { type: "url_citation", url: "javascript:alert(1)", title: "Unsafe citation" },
          { type: "url_citation", title: "Missing citation URL" },
        ],
      }],
    }],
  }, "water", { name: "Wintersburg 313", location: "Maricopa County, Arizona" }, [citationUrl]);

  assert.equal(retrieval.length, 1);
  assert.equal(retrieval[0].canonicalUrl, citationUrl);
  assert.equal(retrieval[0].claimCited, true);
  assert.equal(retrieval[0].sourceChannel, "output-url-citation");
  assert.ok(retrieval.sourceLedger.rejectedCount >= 4);
  assert.ok(retrieval.sourceChannelTelemetry.some((entry) =>
    entry.sourceChannel === "output-url-citation"
      && entry.outcome === "rejected"
      && entry.reason === "unsafe-url"));
  assert.ok(retrieval.sourceChannelTelemetry.some((entry) =>
    entry.sourceChannel === "provider-structured-sources"
      && entry.reason === "missing-url"));
  assert.doesNotMatch(JSON.stringify(retrieval.sourceChannelTelemetry), /127\.0\.0\.1|javascript:/);
});

test("uses the governed source-family priority while retaining comparable records", () => {
  const retrieval = normalizeRetrievedSources({
    output: [{
      type: "web_search_call",
      action: {
        sources: [
          { url: "https://news.example.com/atlas", title: "Market summary" },
          { url: "https://investor.example.com/atlas", title: "Atlas company press release" },
          { url: "https://www.ercot.com/grid/atlas", title: "ERCOT interconnection record" },
          { url: "https://utility.example.com/atlas", title: "Texas electric utility tariff" },
        ],
      },
    }],
  }, "project-identity", { name: "Atlas", location: "Taylor County, Texas" });
  assert.equal(retrieval[0].url, "https://investor.example.com/atlas");
  assert.equal(retrieval.at(-1).url, "https://news.example.com/atlas");
});

test("ignores model output text as a source passage", () => {
  const body = {
    output: [
      {
        type: "web_search_call",
        action: {
          sources: [{
            url: "https://example.com/atlas/filing",
            title: "Atlas filing",
            snippet: "Captured provider passage.",
          }],
        },
      },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: '{"claimPassage":"Model-only unsupported quotation"}',
          annotations: [{
            type: "url_citation",
            url: "https://example.com/atlas/filing",
            title: "Atlas filing",
          }],
        }],
      },
    ],
  };
  const sources = normalizeRetrievedSources(body);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].excerpt, "Captured provider passage.");
  assert.equal(sources[0].claimCited, true);
  assert.equal(sources[0].excerpt.includes("Model-only"), false);
});

test("canonicalizes tracking variants without collapsing document-defining query parameters", () => {
  const sources = normalizeRetrievedSources({
    output: [{
      type: "web_search_call",
      action: {
        sources: [
          { url: "https://agency.gov/report?id=7&utm_source=brief", title: "Agency report", excerpt: "Project Atlas record." },
          { url: "https://agency.gov/report?id=7&utm_medium=email", title: "Agency report duplicate", excerpt: "Project Atlas record." },
          { url: "https://agency.gov/report?id=8&utm_source=brief", title: "Agency report amendment", excerpt: "Project Atlas amendment." },
        ],
      },
    }],
  });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].canonicalUrl, "https://agency.gov/report?id=7");
  assert.equal(sources[1].canonicalUrl, "https://agency.gov/report?id=8");
  assert.equal(sources.sourceLedger.rawOccurrenceCount, 3);
  assert.equal(sources.sourceLedger.rejectedCount, 1);
  assert.equal(sources.sourceLedger.ledger.find((entry) => entry.rejectionCode === "duplicate-canonical-source").duplicateOf, sources.sourceLedger.retained[0].occurrenceId);
});

test("reuses provider-declared canonical receipts across concurrent categories without starving plain URLs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-canonical-receipt-test-"));
  const canonicalUrl = "https://records.fixture/project-atlas/decision?id=7";
  const response = responseRecorder();
  let providerCalls = 0;
  const providerCategories = [];
  let documentCalls = 0;
  const openedUrls = [];
  const categorySource = (categoryId, index) => {
    const isCanonicalReceipt = index === 0 && ["grid", "electricity"].includes(categoryId);
    const url = isCanonicalReceipt
      ? `https://agency.gov/${categoryId}/atlas-decision`
      : `https://plain.fixture/${categoryId}/atlas-${index}`;
    return {
      ...retrievedSource,
      url,
      searchDomain: categoryId,
      categoryIds: [categoryId],
      ...(isCanonicalReceipt ? { canonicalUrl } : {}),
      title: `Project Atlas ${isCanonicalReceipt ? "official commission decision" : `${categoryId} fixture ${index}`}`,
      excerpt: "Project Atlas fixture passage.",
      claimPassage: "Project Atlas fixture passage.",
      claimSupport: RESEARCH_EVIDENCE_IDS.map((evidenceId) => ({ evidenceId, values: [42] })),
      exactProject: true,
      accessOutcome: {
        state: "accessible",
        passage: "Project Atlas fixture passage.",
        extractionMethod: "synthetic-fixture",
      },
    };
  };
  const responseForCategory = (categoryId) => {
    const research = validResearchResponse();
    for (const item of research.evidence) {
      Object.assign(item, {
        value: 42,
        numericValue: 42,
        classification: "Management Assertion",
        sourceUrl: canonicalUrl,
        sourceUrls: [canonicalUrl],
        coverageStatus: "supported",
        claimPassage: "Project Atlas fixture passage.",
        description: "The fixture reports a project-specific value.",
        claimTimePeriod: "2026",
      });
    }
    return singleCallResponse(research, Array.from({ length: 10 }, (_, index) => categorySource(categoryId, index)));
  };
  const categoryIdsForFairDiscovery = [
    "project-identity",
    "grid",
    "electricity",
    "water",
    "permitting-community",
    "construction-capital",
    "tenant-counterparty",
    "climate-operational-hazard",
  ];
  const discoverySources = Array.from({ length: 10 }, (_, index) =>
    categoryIdsForFairDiscovery.map((categoryId) => categorySource(categoryId, index))).flat();

  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery(discoverySources),
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      const prompt = JSON.parse(init.body).input?.[1]?.content ?? "";
      const categoryId = prompt.match(/\bCategory:\s*[^\n]*\(([a-z][a-z0-9-]*)\)\./)?.[1] ?? "project-identity";
      providerCategories.push(categoryId);
      return responseForCategory(categoryId);
    },
    documentFetchImpl: async (url) => {
      documentCalls += 1;
      openedUrls.push(String(url));
      await new Promise((resolve) => setTimeout(resolve, 2));
      return substantiveHtmlResponse("Project Atlas fixture passage.", url);
    },
  });

  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.ok(/project-identity|puc\.texas\.gov/.test(openedUrls[0]));
  assert.equal(response.json().researchAudit.identityPhysicalOpenOpportunityReserved, true);
  const expectedProviderCategories = [
    "project-identity",
    "grid",
    "electricity",
    "water",
    "permitting-community",
    "construction-capital",
    "tenant-counterparty",
    "climate-operational-hazard",
  ];
  assert.deepEqual([...providerCategories].sort(), [...expectedProviderCategories].sort());
  assert.ok(providerCalls >= 8);
  assert.equal(documentCalls, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpensUsed, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudget, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  const grid = payload.researchAudit.categories.find((category) => category.categoryId === "grid");
  const electricity = payload.researchAudit.categories.find((category) => category.categoryId === "electricity");
  const gridReceipt = grid.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  const electricityReceipt = electricity.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  assert.equal(openedUrls.filter((url) => [
    "https://agency.gov/grid/atlas-decision",
    "https://agency.gov/electricity/atlas-decision",
  ].includes(url)).length, 1);
  assert.equal(gridReceipt.opened, false);
  assert.equal(gridReceipt.reusedReceipt, true);
  assert.equal(electricityReceipt.opened, false);
  assert.equal(electricityReceipt.reusedReceipt, true);
  assert.deepEqual(electricityReceipt.referringUrls, [
    "https://agency.gov/grid/atlas-decision",
    "https://agency.gov/electricity/atlas-decision",
  ]);
  assert.ok(openedUrls.some((url) => url.startsWith("https://plain.fixture/electricity/")));
  assert.ok(payload.researchAudit.categories
    .flatMap((category) => category.openedDocuments)
    .filter((document) => document.reusedReceipt === false && document.attempted === true)
    .every((document) => document.opened === true));
});

test("classifies exactly three canonical research outcomes", () => {
  assert.equal(
    classifyCanonicalResearchOutcome(1, []),
    "complete-with-eligible-evidence",
  );
  assert.equal(
    classifyCanonicalResearchOutcome(0, []),
    "complete-no-eligible-evidence",
  );
  assert.equal(
    classifyCanonicalResearchOutcome(3, ["provider-rate-limit"]),
    "incomplete-technical-limitation",
  );
});

test("reuses one failed explicit canonical receipt across categories and counts one physical open", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-failed-canonical-receipt-test-"));
  const response = responseRecorder();
  const canonicalUrl = "https://records.fixture/project-atlas/blocked-decision?id=7";
  let documentCalls = 0;
  const openedUrls = [];
  const categoryLabels = [["grid", "Grid"], ["electricity", "Electricity"]];
  const responseForCategory = (categoryId) => {
    const research = validResearchResponse();
    const sourceUrl = canonicalUrl;
    for (const item of research.evidence) {
      Object.assign(item, {
        value: 42,
        numericValue: 42,
        classification: "Management Assertion",
        sourceUrl,
        sourceUrls: [sourceUrl],
        coverageStatus: "supported",
        claimPassage: "Project Atlas fixture passage.",
        description: "The fixture reports a project-specific value.",
        claimTimePeriod: "2026",
      });
    }
    const sources = [
      {
        ...retrievedSource,
        url: `https://agency.gov/${categoryId}/atlas-decision`,
        canonicalUrl,
        searchDomain: categoryId,
        categoryIds: [categoryId],
        title: "Project Atlas blocked canonical decision",
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...retrievedSource,
        url: `https://plain.fixture/${categoryId}/atlas-${index}`,
        searchDomain: categoryId,
        categoryIds: [categoryId],
        title: `Project Atlas ${categoryId} plain fixture ${index}`,
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
      })),
    ];
    return singleCallResponse(research, sources);
  };
  const discoverySources = categoryLabels.flatMap(([categoryId]) => {
    return [
      {
        ...retrievedSource,
        url: `https://agency.gov/${categoryId}/atlas-decision`,
        canonicalUrl,
        title: "Project Atlas blocked canonical decision",
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
        categoryIds: [categoryId],
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...retrievedSource,
        url: `https://plain.fixture/${categoryId}/atlas-${index}`,
        title: `Project Atlas ${categoryId} plain fixture ${index}`,
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
        categoryIds: [categoryId],
      })),
    ];
  });
  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery(discoverySources),
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async (_url, init) => {
      const prompt = JSON.parse(init.body).input?.[1]?.content ?? "";
      const categoryId = categoryLabels.find(([, label]) =>
        prompt.includes(`observed ${label} category attempt`))?.[0] ?? "grid";
      return responseForCategory(categoryId);
    },
    documentFetchImpl: async (url) => {
      documentCalls += 1;
      openedUrls.push(String(url));
      return new Response("blocked", { status: 403, headers: { "content-type": "text/plain" } });
    },
    categoryIds: categoryLabels.map(([categoryId]) => categoryId),
  });
  const payload = response.json();
  const grid = payload.researchAudit.categories.find((category) => category.categoryId === "grid");
  const electricity = payload.researchAudit.categories.find((category) => category.categoryId === "electricity");
  const gridReceipt = grid.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  const electricityReceipt = electricity.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  assert.equal(documentCalls, 11);
  assert.equal(payload.researchCoverage.physicalOpensUsed, 11);
  assert.equal(openedUrls.filter((url) => [
    "https://agency.gov/grid/atlas-decision",
    "https://agency.gov/electricity/atlas-decision",
  ].includes(url)).length, 1);
  assert.equal(gridReceipt.accessState, "blocked");
  assert.equal(gridReceipt.accessOutcome, "http-403");
  assert.equal(gridReceipt.reusedReceipt, true);
  assert.equal(electricityReceipt.accessState, "blocked");
  assert.equal(electricityReceipt.accessOutcome, "http-403");
  assert.equal(electricityReceipt.reusedReceipt, true);
  assert.equal(electricityReceipt.opened, false);
  assert.deepEqual(electricityReceipt.referringUrls, [
    "https://agency.gov/grid/atlas-decision",
    "https://agency.gov/electricity/atlas-decision",
  ]);
});

test("counts failed document receipts once before limiting later concurrent category work", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-failed-receipt-budget-test-"));
  const response = responseRecorder();
  let documentCalls = 0;
  const openedUrls = [];
  const categoryLabels = [
    ["grid", "Grid"],
    ["electricity", "Electricity"],
    ["water", "Water"],
    ["permitting-community", "Permitting and community"],
    ["construction-capital", "Construction and capital"],
    ["tenant-counterparty", "Tenant and counterparty"],
    ["climate-operational-hazard", "Climate and operational hazard"],
  ];
  const sourceForCategory = (categoryId, index) => ({
    ...retrievedSource,
    url: `https://receipt.fixture/${categoryId}/document-${index}${index === 1 ? "-failed" : index === 2 ? "-blocked" : ""}`,
    searchDomain: categoryId,
    categoryIds: [categoryId],
    title: `Project Atlas ${categoryId} receipt ${index}`,
    excerpt: "Project Atlas fixture passage.",
    claimPassage: "Project Atlas fixture passage.",
    claimSupport: RESEARCH_EVIDENCE_IDS.map((evidenceId) => ({ evidenceId, values: [42] })),
    exactProject: true,
    accessStatus: "open",
  });
  const responseForCategory = (categoryId) => {
    const sources = Array.from({ length: 10 }, (_, index) => sourceForCategory(categoryId, index));
    const research = validResearchResponse();
    for (const item of research.evidence) {
      Object.assign(item, {
        value: 42,
        numericValue: 42,
        classification: "Management Assertion",
        sourceUrl: sources[0].url,
        sourceUrls: [sources[0].url],
        coverageStatus: "supported",
        claimPassage: "Project Atlas fixture passage.",
        description: "The fixture reports a project-specific value.",
        claimTimePeriod: "2026",
      });
    }
    return singleCallResponse(research, sources);
  };
  const discoverySources = categoryLabels.flatMap(([categoryId]) =>
    Array.from({ length: 10 }, (_, index) => sourceForCategory(categoryId, index)));

  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery(discoverySources),
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async (_url, init) => {
      const prompt = JSON.parse(init.body).input?.[1]?.content ?? "";
      const categoryId = categoryLabels.find(([, label]) =>
        prompt.includes(`observed ${label} category attempt`))?.[0] ?? "project-identity";
      return responseForCategory(categoryId);
    },
    documentFetchImpl: async (url) => {
      documentCalls += 1;
      openedUrls.push(String(url));
      if (url.endsWith("-failed")) throw new Error("fixture connection failed");
      if (url.endsWith("-blocked")) {
        return new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/plain" },
        });
      }
      return substantiveHtmlResponse("Project Atlas fixture passage.", url);
    },
    categoryIds: categoryLabels.map(([categoryId]) => categoryId),
  });

  const payload = response.json();
  const documents = payload.researchAudit.categories.flatMap((category) => category.openedDocuments);
  const failedReceipt = documents.find((document) =>
    document.originalUrl.endsWith("-failed") && document.accessOutcome === "network-failure");
  const blockedReceipt = documents.find((document) =>
    document.originalUrl.endsWith("-blocked") && document.accessOutcome === "http-403");
  const budgetLimitedDocuments = documents.filter((document) =>
    document.accessOutcome === "physical-open-budget");

  assert.equal(response.statusCode, 200);
  assert.equal(documentCalls, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpensUsed, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  assert.equal(new Set(openedUrls).size, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.ok(openedUrls.some((url) => url.endsWith("-failed")));
  assert.ok(openedUrls.some((url) => url.endsWith("-blocked")));
  assert.equal(failedReceipt.opened, false);
  assert.equal(failedReceipt.attempted, true);
  assert.equal(failedReceipt.reusedReceipt, true);
  assert.equal(failedReceipt.accessState, "blocked");
  assert.equal(failedReceipt.accessOutcome, "network-failure");
  assert.equal(blockedReceipt.opened, false);
  assert.equal(blockedReceipt.attempted, true);
  assert.equal(blockedReceipt.reusedReceipt, true);
  assert.equal(blockedReceipt.accessState, "blocked");
  assert.equal(blockedReceipt.accessOutcome, "http-403");
  assert.ok(budgetLimitedDocuments.length > 0);
  assert.ok(budgetLimitedDocuments.every((document) =>
    document.opened === false && document.attempted === false && document.reusedReceipt === true));
  assert.ok(payload.researchAudit.categories.some((category) =>
    category.followUpSkipReason === "physical-open-budget"));
});

test("retains a late primary candidate before the bounded cap and records cap discards", () => {
  const sources = normalizeRetrievedSources({
    output: [{
      type: "web_search_call",
      action: {
        sources: [
          ...Array.from({ length: 11 }, (_, index) => ({
            url: `https://news.example/atlas-${index + 1}`,
            title: `Regional report ${index + 1}`,
            excerpt: "Regional context only.",
          })),
          {
            url: "https://agency.gov/atlas-final",
            title: "Agency final decision for Project Atlas",
            excerpt: "The final decision names Project Atlas.",
          },
        ],
      },
    }],
  });
  assert.equal(sources.length, 10);
  assert.equal(sources.some((source) => source.url === "https://agency.gov/atlas-final"), true);
  assert.equal(sources.sourceLedger.capDiscardCount, 2);
  assert.equal(sources.sourceLedger.ledger.filter((entry) => entry.rejectionCode === "retention-cap").length, 2);
});

test("unrelated secondary URLs cannot authorize Verified Evidence or model impact", () => {
  const body = validResearchResponse();
  const target = body.evidence.find((item) => item.id === "grid_interconnection");
  target.classification = "Verified Evidence";
  target.value = "Regional queue position";
  target.numericValue = 42;
  target.sourceUrl = "https://news.example/regional-queue";
  target.sourceUrls = [target.sourceUrl];
  target.citation = "Regional reporting: https://news.example/regional-queue";
  const parsed = parseResearchResponse(body, [{
    url: target.sourceUrl,
    title: "Regional queue reporting",
    excerpt: "A regional queue summary without the Project Atlas identity.",
    sourceClass: "secondary-reporting",
  }], null);
  const record = parsed.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(record.classification, "Management Assertion");
  assert.equal(record.eligibleForModel, false);
  assert.equal(record.sourceUrl, undefined);
  assert.equal(record.sourceValidation.state, "rejected");
  assert.ok(record.sourceValidation.rejectionCodes.includes("not-project-specific"));
  assert.equal(record.numericValue, undefined);
});

test("production mappings use retained passage identity for unassessed Google sources", () => {
  const projectKnownData = {
    aliases: ["Red Oak"],
    operator: "DataBank",
    city: "Red Oak",
    state: "Texas",
  };
  const passage = "The DataBank Red Oak data center campus is located in Red Oak, Texas. The filing reports an interconnection interval of 365 days.";
  const evaluate = ({ retainedPassage = passage, operator = "DataBank" } = {}) => {
    const body = validResearchResponse();
    body.projectSummary = {
      ...body.projectSummary,
      name: "Red Oak Campus",
      location: "Red Oak, Texas",
    };
    const item = body.evidence.find((candidate) => candidate.id === "grid_interconnection");
    const url = "https://records.example.test/databank/red-oak";
    Object.assign(item, {
      value: 365,
      numericValue: 365,
      unit: "days",
      classification: "Management Assertion",
      sourceUrl: url,
      sourceUrls: [url],
      coverageStatus: "supported",
      claimPassage: passage,
      description: "The filing reports the project interconnection interval.",
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      claimTimePeriod: "2026",
    });
    const source = {
      url,
      title: "Google-discovered public source",
      origin: "google-grounded-search",
      sourceChannel: "google-grounded-search",
      discoveryOnly: true,
      sourceClass: "primary-company",
      excerpt: retainedPassage ?? "",
      claimSupport: [{ evidenceId: "grid_interconnection", values: [365] }],
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
      accessOutcome: { state: "accessible", passage: retainedPassage ?? null },
    };
    assert.equal(Object.hasOwn(source, "exactProject"), false);
    const parsed = parseResearchResponse(body, [source], null, null, {
      ...projectKnownData,
      operator,
    });
    return parsed.evidence.find((candidate) => candidate.id === "grid_interconnection");
  };

  const matching = evaluate();
  assert.equal(matching.claimMappings[0].entityScope, "project");
  assert.equal(matching.claimMappings[0].supportStatus, "supported");
  assert.equal(matching.sources[0].exactProject, true,
    "DataBank directly before the project name establishes operator attribution without a possessive");

  const noPassage = evaluate({ retainedPassage: null });
  assert.equal(noPassage.claimMappings[0].entityScope, "related");
  assert.equal(noPassage.claimMappings[0].supportStatus, "context-only");

  const operatorConflict = evaluate({ operator: "Compass" });
  assert.equal(operatorConflict.claimMappings[0].entityScope, "related");
  assert.equal(operatorConflict.claimMappings[0].supportStatus, "context-only");
});

test("project-specific sources with irrelevant passages or unknown scope remain ineligible", () => {
  const body = validResearchResponse();
  const timeline = body.evidence.find((item) => item.id === "grid_interconnection");
  timeline.classification = "Verified Evidence";
  timeline.value = 42;
  timeline.numericValue = 42;
  timeline.unit = "months";
  timeline.sourceUrl = "https://example.com/atlas/opening";
  timeline.sourceUrls = [timeline.sourceUrl];
  timeline.claimPassage = "Project Atlas opened its doors in 2026.";
  timeline.facilityScope = "exact-project";
  timeline.phaseScope = "unknown";
  timeline.claimTimePeriod = null;
  const parsed = parseResearchResponse(body, [{
    ...retrievedSource,
    url: timeline.sourceUrl,
    date: null,
    title: "Project Atlas opening notice",
    excerpt: "Project Atlas opened its doors in 2026.",
    exactProject: true,
    claimSupport: [{ evidenceId: "grid_interconnection", value: "42 months" }],
    facilityScope: "exact-project",
    phaseScope: "unknown",
    timePeriod: null,
  }], null);
  const result = parsed.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(result.eligibleForModel, false);
  assert.equal(result.classification, "Management Assertion");
  assert.equal(result.sourceValidation.state, "rejected");
  assert.ok(result.sourceValidation.rejectionCodes.includes("wrong-phase-or-facility"));
  assert.ok(result.sourceValidation.rejectionCodes.includes("missing-time-scope"));
  assert.ok(result.claimMappings.some((mapping) => mapping.supportStatus !== "supported"));
});

test("contained evidence and its source ledger agree on financial eligibility", () => {
  const canonicalUrl = "https://example.com/atlas/eligible";
  const contained = containResearchResult({
    sourceLedger: [{
      canonicalUrl,
      sourceState: "claim-supported",
      transitions: [],
    }],
    evidence: [{
      id: "electricity_cost",
      value: 42,
      numericValue: 42,
      unit: "USD/MWh",
      classification: "Management Assertion",
      citation: "The filing reports 42 USD/MWh.",
      description: "The facility electricity cost is 42 USD/MWh.",
      sourceUrl: canonicalUrl,
      sourceRelevance: "exact-project",
      sourceSupportConfidence: 94,
      coverageStatus: "supported",
      claimMappings: [{ supportStatus: "supported", sourceId: canonicalUrl }],
      sources: [{
        url: canonicalUrl,
        canonicalUrl,
        resolvedUrl: canonicalUrl,
        title: "Project Atlas tariff filing",
        publisher: "example.com",
        excerpt: "The facility electricity cost is 42 USD/MWh.",
        sourceClass: "primary-company",
        exactProject: true,
        facilityScope: "exact-facility",
        phaseScope: "not-applicable",
        timePeriod: "2026",
        accessStatus: "open",
        relationship: "primary",
      }],
    }],
  });
  assert.equal(contained.evidence[0].eligibleForModel, true);
  assert.equal(contained.sourceLedger[0].financialEligibilityState, "eligible");
});

test("does not promote model output annotations into source passages", () => {
  const sources = normalizeRetrievedSources({
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: "Project Kilby will provide dedicated power directly to a Microsoft-operated data center under a 20-year agreement.",
        annotations: [{
          type: "url_citation",
          url: "https://example.com/kilby-power",
          title: "Project Kilby power agreement",
        }],
      }],
    }],
  }, "targeted-customer_concentration");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].sourceChannel, "output-url-citation");
  assert.equal(sources[0].excerpt, "");
});

test("promotes structured research URLs into physical candidate access when action sources omit them", () => {
  const structuredUrl = "https://records.example.gov/arizona/wintersburg-313";
  const sources = normalizeRetrievedSources({
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          evidence: [{
            sourceUrl: structuredUrl,
            sourceUrls: [structuredUrl],
            citation: `Maricopa County record: ${structuredUrl}`,
          }],
        }),
      }],
    }],
  }, "permitting-community", {
    name: "Wintersburg 313",
    location: "Tonopah, Maricopa County, Arizona",
  }, [structuredUrl, structuredUrl]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, structuredUrl);
  assert.equal(sources[0].origin, "structured-research-source");
  assert.equal(sources[0].claimCited, true);
  assert.equal(sources[0].accessOutcome ?? null, null);
  assert.equal(sources[0].exactProject ?? null, null);
});

test("physically accesses a structured research URL before normal source evaluation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-structured-source-access-test-"));
  const sourceUrl = "https://records.example.gov/arizona/wintersburg-313";
  const research = validResearchResponse();
  const permitting = research.evidence.find((item) => item.id === "permitting_timeline");
  Object.assign(permitting, {
    value: 6,
    numericValue: 6,
    unit: "months",
    classification: "Management Assertion",
    sourceUrl,
    sourceUrls: [sourceUrl],
    citation: `Maricopa County permit record: ${sourceUrl}`,
    coverageStatus: "supported",
    claimPassage: "Wintersburg 313 construction is scheduled for completion in six months.",
    description: "The named project permit record provides a construction timeline.",
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    claimTimePeriod: "2026",
  });
  const response = responseRecorder();
  await handleResearchProjectRequest(request({
    name: "Wintersburg 313",
    location: "Tonopah, Maricopa County, Arizona",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(research) }],
      }],
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    documentFetchImpl: async (url) => substantiveHtmlResponse(
      "Wintersburg 313 construction is scheduled for completion in six months.",
      url,
    ),
    categoryIds: ["permitting-community"],
  });
  const payload = response.json();
  const source = payload.sourceLedger.find((candidate) => candidate.originalUrl === sourceUrl);
  const category = payload.researchAudit.categories.find((candidate) => candidate.categoryId === "permitting-community");
  assert.equal(response.statusCode, 200);
  assert.equal(source.accessOutcome.state, "accessible");
  assert.equal(source.accessOutcome.physicalOpenIndex, 1);
  assert.ok(source.accessOutcome.passage.includes("Wintersburg 313 construction is scheduled for completion in six months."));
  assert.equal(category.openedDocuments[0].attempted, true);
  assert.equal(category.openedDocuments[0].accessState, "accessible");
  const evidence = payload.evidence.find((item) => item.id === "permitting_timeline");
  assert.equal(evidence.eligibleForModel, false);
  assert.ok(evidence.quarantineReasons.length > 0);
});

test("extracts only tool-observed search queries and labels absent telemetry as unavailable", () => {
  assert.deepEqual(extractSearchTerms({
    output: [
      { type: "web_search_call", action: { query: "Project Atlas Taylor County permit" } },
      { type: "web_search_call", action: { queries: ["Project Atlas utility filing", { query: "Project Atlas water rights" }] } },
    ],
  }), ["Project Atlas Taylor County permit", "Project Atlas utility filing", "Project Atlas water rights"]);
  assert.deepEqual(extractSearchTerms({ output: [{ type: "message" }] }), []);
});

test("retains up to the complete 32-query observed budget before attribution", () => {
  const queries = Array.from({ length: 12 }, (_, index) => `Project Atlas query ${index + 1}`);
  assert.deepEqual(extractSearchTerms({
    output: queries.map((query) => ({ type: "web_search_call", action: { query } })),
  }), queries);
});

test("counts web-search calls and exposes an explicit over-budget coverage flag", () => {
  const providerBody = {
    output: Array.from({ length: 33 }, (_, index) => ({
      type: "web_search_call",
      action: { query: `Project Atlas query ${index + 1}` },
    })),
  };
  assert.equal(countWebSearchCalls(providerBody), 33);
  assert.equal(extractSearchTerms(providerBody).length, 32);
  const result = parseResearchResponse(validResearchResponse(), [], "2026-09-03", {
    searchTerms: extractSearchTerms(providerBody),
    toolCallCount: countWebSearchCalls(providerBody),
    toolCallBudgetExceeded: true,
  });
  assert.equal(result.researchCoverage.toolCallCount, 32);
  assert.equal(result.researchCoverage.toolCallLimit, 32);
  assert.equal(result.researchCoverage.toolCallBudgetExceeded, true);
});

test("attributes only exact deterministic plan queries and keeps overlapping alternates global", () => {
  const project = {
    name: "Project Atlas",
    location: "Taylor County, Texas",
    knownData: { operator: "Atlas Compute", status: "Planned" },
  };
  const electricityQuery = buildVariableQueries(project, "electricity_cost")[0];
  const waterRightsQuery = buildVariableQueries(project, "water_rights")[1];
  const overlappingAlternate = "\"Project Atlas\" water permit demand rights consumption allocation";
  const body = {
    output: [
      { type: "web_search_call", action: { query: electricityQuery } },
      { type: "web_search_call", action: { query: waterRightsQuery } },
      { type: "web_search_call", action: { query: overlappingAlternate } },
    ],
  };
  assert.deepEqual(extractSearchTerms(body), [electricityQuery, waterRightsQuery, overlappingAlternate]);
  assert.deepEqual(extractObservedQueriesByEvidence(body, project), {
    electricity_cost: [electricityQuery],
    water_rights: [waterRightsQuery],
  });
});

test("keeps global observed queries separate from per-variable AI-reported queries", () => {
  const body = validResearchResponse();
  const project = { name: "Project Atlas", location: "Taylor County, Texas" };
  const electricityQuery = buildVariableQueries(project, "electricity_cost")[0];
  body.evidence[0].searchTerms = ["AI-reported electricity price query"];
  body.evidence[1].searchTerms = ["AI-reported water use query"];
  const result = parseResearchResponse(body, [], "2026-09-03", {
    searchTerms: ["Project Atlas global identity query", electricityQuery],
    observedQueriesByEvidence: {
      electricity_cost: [electricityQuery],
    },
  });
  assert.deepEqual(result.researchCoverage.searchTerms, [
    "Project Atlas global identity query",
    electricityQuery,
  ]);
  assert.deepEqual(result.researchCoverage.observedQueriesByEvidence, {
    electricity_cost: [electricityQuery],
  });
  assert.deepEqual(result.evidence[0].searchTerms, [electricityQuery]);
  assert.equal(result.evidence[0].searchTermsSource, "tool-observed");
  assert.deepEqual(result.evidence[1].searchTerms, ["AI-reported water use query"]);
  assert.equal(result.evidence[1].searchTermsSource, "ai-reported");
});

test("normalizes model-reported confidence without deriving it from source support", () => {
  assert.equal(normalizeModelReportedConfidence(73.6), 74);
  for (const invalid of [null, "88", Number.NaN, -1, 101]) {
    assert.equal(normalizeModelReportedConfidence(invalid), null);
  }
  const body = validResearchResponse();
  body.evidence[0].modelReportedConfidence = 88.4;
  body.evidence[0].citation = "No claim-specific source was returned.";
  body.evidence[0].sourceUrls = [];
  delete body.evidence[0].sourceUrl;
  body.evidence[1].modelReportedConfidence = null;
  body.evidence[1].value = "Company-reported cooling arrangement";
  const result = parseResearchResponse(body, [withRetrievedPassage({
    ...retrievedSource,
    sourceClass: "primary-government",
  })]);
  assert.equal(result.evidence[0].modelReportedConfidence, 88);
  assert.equal(result.evidence[0].sourceSupportConfidence, 0);
  assert.equal("modelReportedConfidence" in result.evidence[1], false);
  assert.equal(result.evidence[1].sourceSupportConfidence, 82);
});

test("computes bounded support confidence from exact-project source class and independence", () => {
  const source = (url, sourceClass, exactProject = true) => ({
    url,
    sourceClass,
    exactProject,
    relationship: "primary",
    publisher: new URL(url).hostname,
  });
  assert.equal(calculateSourceSupportConfidence({ classification: "Missing Evidence", sources: [source("https://agency.gov/a", "primary-government")] }), 0);
  assert.equal(calculateSourceSupportConfidence({ classification: "Verified Evidence", sources: [] }), 0);
  assert.equal(calculateSourceSupportConfidence({ classification: "Verified Evidence", sources: [source("https://agency.gov/a", "primary-government")] }), 82);
  assert.equal(calculateSourceSupportConfidence({
    classification: "Verified Evidence",
    sources: [source("https://agency.gov/a", "primary-government"), source("https://utility.example/a", "primary-utility")],
  }), 94);
  assert.equal(calculateSourceSupportConfidence({
    classification: "Verified Evidence",
    sources: [source("https://news.example/a", "secondary-reporting", false)],
  }), 38);
  assert.equal(calculateSourceSupportConfidence({
    classification: "Verified Evidence",
    sources: [source("https://agency.gov/a", "primary-government"), source("https://utility.example/a", "primary-utility")],
    coverageStatus: "conflicting",
    conflictSummary: "Sources disagree.",
  }), 59);
});

test("maps only validated claim URLs and attaches auditable source metadata", () => {
  const research = validResearchResponse();
  research.evidence[0] = {
    ...research.evidence[0],
    classification: "Verified Evidence",
    sourceUrl: "https://example.com/atlas/source",
    sourceUrls: ["https://example.com/atlas/source", "https://evil.example/invented"],
    sourceRelevance: "exact-project",
    sourceRelevanceNote: "The filing names Project Atlas and its facility location.",
    classificationReason: "A public filing directly names the project.",
  };
  const parsed = parseResearchResponse(research, [withRetrievedPassage({
    ...retrievedSource,
    sourceClass: "primary-government",
  })], "2026-09-03", {
    searchTerms: ["Project Atlas electricity tariff filing"],
    observedQueriesByEvidence: {
      electricity_cost: ["Project Atlas electricity tariff filing"],
    },
  });
  assert.deepEqual(parsed.evidence[0].sources.map((source) => source.url), [retrievedSource.url]);
  assert.equal(parsed.evidence[0].sourceSupportConfidence, 82);
  assert.equal(parsed.evidence[0].sourceRelevance, "exact-project");
  assert.match(parsed.evidence[0].classificationReason, /public filing/);
  assert.equal(parsed.evidence[0].searchTermsSource, "tool-observed");
  assert.deepEqual(parsed.evidence[0].searchTerms, ["Project Atlas electricity tariff filing"]);
});

test("resolves a redirected Arizona source from provider URL through physical access to eligibility", () => {
  const body = validResearchResponse();
  body.projectSummary = {
    ...body.projectSummary,
    location: "Phoenix, Maricopa County, Arizona",
  };
  const originalUrl = "https://azcc.gov/records/project-atlas";
  const finalUrl = "https://azcc.gov/records/project-atlas/decision";
  const target = body.evidence.find((item) => item.id === "grid_interconnection");
  Object.assign(target, {
    value: 365,
    numericValue: 365,
    unit: "days",
    classification: "Verified Evidence",
    sourceUrl: originalUrl,
    sourceUrls: [originalUrl],
    citation: `Arizona Corporation Commission decision: ${originalUrl}`,
    claimPassage: "Project Atlas is located in Phoenix, Maricopa County, Arizona. The filing reports 365 for the exact project.",
    description: "The decision establishes the project-specific interconnection timeline.",
    claimTimePeriod: "2026",
  });
  const redirectedSource = {
    ...retrievedSource,
    url: originalUrl,
    resolvedUrl: finalUrl,
    canonicalUrl: finalUrl,
    title: "Project Atlas Arizona Corporation Commission decision",
    excerpt: "Project Atlas is located in Phoenix, Maricopa County, Arizona. The filing reports 365 for the exact project.",
    claimPassage: "Project Atlas is located in Phoenix, Maricopa County, Arizona. The filing reports 365 for the exact project.",
    claimSupport: [{ evidenceId: "grid_interconnection", values: [365] }],
    sourceClass: "primary-government",
    exactProject: true,
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    timePeriod: "2026",
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      originalUrl,
      resolvedUrl: finalUrl,
      canonicalUrl: finalUrl,
      passage: "Project Atlas is located in Phoenix, Maricopa County, Arizona. The filing reports 365 for the exact project.",
      physicalOpenIndex: 1,
    },
  };
  const parsed = parseResearchResponse(body, [redirectedSource]);
  const record = parsed.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(record.eligibleForModel, true);
  assert.equal(record.sourceUrl, finalUrl);
  assert.equal(record.sources[0].canonicalUrl, finalUrl);
  assert.equal(record.sources[0].originalUrl, originalUrl);
  assert.equal(record.sources[0].accessOutcome.state, "accessible");
  assert.equal(record.claimMappings[0].sourceId, finalUrl);
  assert.equal(
    record.claimMappings[0].supportStatus,
    "supported",
    JSON.stringify({
      source: record.sources[0],
      mapping: record.claimMappings[0],
    }),
  );
});

test("carries a generic first-party disclosure from normalized URL through visible proposal handoff", async () => {
  const disclosureUrl = "https://developer.example/disclosures/atlas-campus?utm_source=provider";
  const passage = "Atlas Compute develops Project Atlas in Taylor County, Texas, describing the 600 MW campus on 400 acres and reporting a 365-day interconnection timeline, $42/MWh electricity cost, 6% annual electricity escalation, and 25% renewable procurement for its 2026 construction phase.";
  const research = validResearchResponse();
  for (const item of research.evidence) {
    delete item.sourceUrl;
    item.sourceUrls = [];
    item.citation = "No source cited for this non-grid item.";
  }
  const gridClaims = {
    grid_interconnection: { value: 365, unit: "days" },
    electricity_cost: { value: 42, unit: "$/MWh" },
    electricity_escalation: { value: 6, unit: "%" },
    renewable_percentage: { value: 25, unit: "%" },
  };
  for (const [id, claim] of Object.entries(gridClaims)) {
    Object.assign(research.evidence.find((item) => item.id === id), {
      value: claim.value,
      numericValue: claim.value,
      unit: claim.unit,
      classification: "Management Assertion",
      sourceUrl: disclosureUrl,
      sourceUrls: [disclosureUrl],
      citation: `Atlas Compute disclosure: ${disclosureUrl}`,
      description: "The first-party disclosure reports a governed exact-project grid claim.",
      claimPassage: passage,
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      claimTimePeriod: "2026",
      coverageStatus: "supported",
    });
  }
  const response = responseRecorder();
  const result = await runValidatedResearch({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    knownData: { operator: "Atlas Compute", companyDomains: ["developer.example"] },
  }, {
    apiKey: "server-secret-for-test",
    req: request({}),
    categoryIds: ["grid"],
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async () => singleCallResponse(research, [{
      ...retrievedSource,
      url: disclosureUrl,
      title: "Atlas Compute Project Atlas disclosure",
      excerpt: passage,
      claimPassage: passage,
      claimSupport: Object.entries(gridClaims).map(([evidenceId, claim]) => ({
        evidenceId,
        values: [claim.value],
      })),
      sourceClass: "primary-company",
      date: "2026-06-15",
      exactProject: true,
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    }]),
    documentFetchImpl: async (url) => {
      assert.equal(url, disclosureUrl);
      return substantiveHtmlResponse(`Project Atlas disclosure ${passage}`, url);
    },
  });
  const record = result.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(record.eligibleForModel, true);
  assert.equal(record.acceptedForModel, false);
  assert.equal(record.sources[0].canonicalUrl, "https://developer.example/disclosures/atlas-campus");
  assert.equal(record.sources[0].accessOutcome.state, "accessible");
  assert.match(record.sources[0].accessOutcome.passage, /600 MW campus/);
  assert.ok(
    record.sources[0].excerpt.includes(record.sources[0].claimPassage),
    JSON.stringify({
      excerpt: record.sources[0].excerpt,
      claimPassage: record.sources[0].claimPassage,
    }),
  );
  assert.equal(
    record.claimMappings[0].supportStatus,
    "supported",
    JSON.stringify({
      source: record.sources[0],
      mapping: record.claimMappings[0],
    }),
  );
  assert.equal(
    result.researchOutcome.state,
    "complete-with-eligible-evidence",
    JSON.stringify({
      outcome: result.researchOutcome,
      candidateLineage: result.researchAudit?.candidateLineage,
    }),
  );
});

test("prioritizes a provider-cited Arizona candidate before the shared physical-open ceiling", () => {
  const body = {
    output: [{
      type: "web_search_call",
      action: {
        sources: [
          { url: "https://example.com/general", title: "General result" },
          { url: "https://aligneddc.com/phoenix-data-centers/?utm_source=openai", title: "Vantage Phoenix Campus page" },
        ],
      },
    }],
  };
  const research = {
    evidence: [{
      sourceUrl: "https://aligneddc.com/phoenix-data-centers/",
      sourceUrls: ["https://aligneddc.com/phoenix-data-centers/"],
      citation: "Vantage Phoenix Campus page",
    }],
  };
  const sources = normalizeRetrievedSources(body, "web-search", {
    name: "Vantage Phoenix Campus",
    location: "Goodyear, Maricopa County, Arizona",
  }, extractResearchSourceUrls(research));
  assert.equal(sources[0].url, "https://aligneddc.com/phoenix-data-centers/?utm_source=openai");
  assert.equal(sources[0].claimCited, true);
});

test("uses an explicit directory alias for exact-project identity without loose URL similarity", () => {
  const body = validResearchResponse();
  body.projectSummary = {
    ...body.projectSummary,
    name: "Aligned Phoenix Campus",
    location: "Phoenix, Maricopa County, Arizona",
  };
  const sourceUrl = "https://aligneddc.com/phoenix-data-centers/";
  const target = body.evidence.find((item) => item.id === "water_consumption");
  Object.assign(target, {
    value: 12,
    numericValue: 12,
    unit: "Mgal/year",
    classification: "Management Assertion",
    sourceUrl,
    sourceUrls: [sourceUrl],
    citation: `The Phoenix campus reports 12 Mgal/year of cooling water use: ${sourceUrl}`,
    claimPassage: "Aligned Phoenix Campus in Phoenix, Maricopa County, Arizona reports 12 Mgal/year of cooling water use.",
    description: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
    facilityScope: "exact-project",
    phaseScope: "not-applicable",
    claimTimePeriod: "2026",
  });
  const source = {
    ...retrievedSource,
    url: sourceUrl,
    title: "Retrieved public source",
    excerpt: "Aligned Phoenix Campus in Phoenix, Maricopa County, Arizona reports 12 Mgal/year of cooling water use.",
    claimPassage: "Aligned Phoenix Campus in Phoenix, Maricopa County, Arizona reports 12 Mgal/year of cooling water use.",
    claimSupport: [{ evidenceId: "water_consumption", values: [12] }],
    sourceClass: "secondary-reporting",
    facilityScope: "exact-project",
    phaseScope: "not-applicable",
    timePeriod: "2026",
    accessOutcome: {
      state: "accessible",
      passage: "Aligned Phoenix Campus in Phoenix, Maricopa County, Arizona reports 12 Mgal/year of cooling water use.",
    },
  };
  const parsed = parseResearchResponse(body, [source], null, null, {
    aliases: ["Aligned Phoenix", "Aligned Data Centers Phoenix"],
  });
  const record = parsed.evidence.find((item) => item.id === "water_consumption");
  assert.equal(record.eligibleForModel, true);
  assert.equal(record.sources[0].exactProject, true);
  assert.equal(record.claimMappings[0].supportStatus, "supported");
});

test("does not let an accessible sibling source authorize a blocked mapped claim", () => {
  const blocked = {
    ...retrievedSource,
    url: "https://example.com/atlas/blocked",
    exactProject: true,
    accessOutcome: { state: "blocked", reason: "http-403" },
  };
  const accessibleSibling = {
    ...retrievedSource,
    url: "https://example.com/atlas/unrelated",
    claimPassage: "A different public fact about Project Atlas in Taylor County, Texas.",
    excerpt: "A different public fact about Project Atlas in Taylor County, Texas.",
    claimSupport: [],
    accessOutcome: { state: "accessible", passage: "A different public fact about Project Atlas in Taylor County, Texas." },
  };
  const research = validResearchResponse();
  const gridRecord = research.evidence.find((item) => item.id === "grid_interconnection");
  Object.assign(gridRecord, {
    sourceUrl: blocked.url,
    sourceUrls: [blocked.url, accessibleSibling.url],
    claimPassage: blocked.claimPassage,
    classification: "Management Assertion",
    value: 365,
    numericValue: 365,
    unit: "days",
  });
  const parsed = parseResearchResponse(research, [blocked, accessibleSibling]);
  const record = parsed.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(record.eligibleForModel, false);
  assert.ok(record.claimMappings.some((mapping) =>
    mapping.sourceId === blocked.url && mapping.supportStatus === "context-only"));
  assert.ok(record.claimMappings.some((mapping) =>
    mapping.sourceId === accessibleSibling.url && mapping.supportStatus === "missing-passage"));
});

test("rejects malformed custom research requests before calling OpenAI", async () => {
  const missingResponse = responseRecorder();
  let calls = 0;
  await handleResearchProjectRequest(request({ location: "Texas" }), missingResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not be called");
    },
  });
  assert.equal(missingResponse.statusCode, 400);
  assert.equal(calls, 0);

  const configuredResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), configuredResponse, {
    apiKey: "",
  });
  assert.equal(configuredResponse.statusCode, 503);
});

test("limits paid custom research requests by client IP", async () => {
  let now = 100_000;
  const rateLimiter = createResearchProjectRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });
  const options = {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-research-rate-limit-")) }),
    rateLimiter,
    fetchImpl: async () => singleCallResponse(),
  };
  await handleResearchProjectRequest(request({ name: "Atlas One", location: "Texas" }), responseRecorder(), options);
  const limited = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Atlas Two", location: "Texas" }), limited, options);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "60");
  assert.match(limited.body, /request limit/i);
  now += 60_001;
  const allowedAgain = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Atlas Three", location: "Texas" }), allowedAgain, options);
  assert.equal(allowedAgain.statusCode, 200);
});

test("uses the bounded OpenAI fallback with scoped strict schemas after Google is unavailable", async () => {
  const response = responseRecorder();
  let requestUrl;
  let requestInit;
  let calls = 0;
  let providerCalls = 0;
  await withOpenAiTpmLimit(30_000, async () => handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Texas",
    knownData: { operator: "Atlas Compute" },
  }), response, {
    apiKey: "server-secret-for-test",
    googleApiKey: "fixture-google-key",
    googleDiscoveryImpl: async () => {
      const error = new Error("fixture Google provider failure");
      error.researchErrorType = "google-provider-failure";
      throw error;
    },
    cache: createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-research-schema-")) }),
    providerGate: createResearchProviderGate({
      tokensPerMinute: 30_000,
      tokenWindowMs: OFFLINE_PROVIDER_TOKEN_WINDOW_MS,
    }),
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
       calls += 1;
       if (url === OPENAI_RESPONSES_URL) providerCalls += 1;
      const researched = validResearchResponse();
      researched.evidence[1].value = "Company-reported cooling arrangement";
      return singleCallResponse(researched);
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse(
      `Atlas Compute operates Project Atlas in Taylor County, Texas. ${retrievedSource.claimPassage}`,
      url,
    ),
  }));
  assert.equal(response.statusCode, 200);
  assert.equal(providerCalls, 1);
  assert.equal(response.json().evidence[1].classification, "Management Assertion");
  assert.equal(response.json().evidence[1].sourceUrl, retrievedSource.url);
  assert.equal(calls, providerCalls);
  assert.equal(response.json().researchAudit.categories.length, 8);
  assert.ok(response.json().researchAudit.categories.every((category) => category.executedQueries.length === 0));
  assert.ok(response.json().researchAudit.categories.every((category) => category.requestedPrimaryQuery.length > 0));
  assert.ok(response.json().researchAudit.categories.some((category) => category.stageCounts.accessed > 0));
  assert.equal(response.json().evidence[0].sources[0].accessOutcome.state, "accessible");
  assert.equal(requestUrl, OPENAI_RESPONSES_URL);
  const body = JSON.parse(requestInit.body);
  assert.equal(body.model, RESEARCH_PROJECT_MODEL);
  assert.equal(RESEARCH_PROJECT_MAX_TOKENS, 8_000);
  assert.equal(RESEARCH_CATEGORY_MAX_TOKENS, 3_500);
  const estimatedInputTokens = Math.ceil(Buffer.byteLength(requestInit.body) / 3);
  assert.equal(
    body.max_output_tokens,
    Math.min(RESEARCH_PROJECT_MAX_TOKENS, Math.max(1_000, 30_000 - estimatedInputTokens - 512)),
    "the full-project fallback must adapt its output reservation to the configured TPM ceiling",
  );
  assert.ok(estimatedInputTokens + body.max_output_tokens < 30_000,
    "the serialized body plus its output reservation must remain below the configured 30k TPM ceiling");
  assert.ok(body.max_tool_calls > 0 && body.max_tool_calls <= RESEARCH_PROJECT_MAX_TOOL_CALLS);
  assert.deepEqual(body.tools, [{ type: "web_search_preview" }]);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  const scopedIds = Object.keys(body.text.format.schema.properties.evidence.properties);
  assert.equal(scopedIds.length, RESEARCH_EVIDENCE_IDS.length);
  assert.ok(scopedIds.every((id) => RESEARCH_EVIDENCE_IDS.includes(id)));
  assert.deepEqual(body.text.format.schema.properties.evidence.required, scopedIds);
  assert.equal(body.input.length, 2);
  assert.match(body.input[1].content, /Project Atlas/);
  assert.match(body.input[1].content, /Texas/);
  assert.match(body.input[1].content, /Atlas Compute/);
  for (const phrase of [
    "electrical-equipment procurement",
    "jurisdictional bans or moratoriums",
    "noise ordinances",
    "local electricity-rate concerns",
    "semiconductor and memory supply-chain constraints",
    "speculative or phantom grid-load requests",
    "not additional modeled evidence inputs",
    "ERCOT BATCH ZERO UPDATE",
    "200 GW across 300 applicants",
    "September 2026 start to January 2027 at earliest",
    "April 2027",
    "financing constraints",
    "17 facilities totaling 6.6 GW",
    "behind-the-meter projects exempt from the ERCOT queue",
    "grid-dependent project should not receive Verified Evidence",
    "no grid-dependent project currently has a confirmed interconnection date",
    "not proof of a named facility's interconnection status",
    "gas-generation or fuel-supply source does not establish",
    "water source does not establish water consumption or water rights",
    "PPA or named offtaker does not establish a customer-concentration number",
  ]) {
    assert.match(RESEARCH_PROJECT_SYSTEM_PROMPT, new RegExp(phrase, "i"));
  }
});

test("uses a dedicated non-evidence schema for project identity discovery", async () => {
  const response = responseRecorder();
  let providerBody = null;
  await handleResearchProjectRequest(request({
    name: "Meta El Paso Data Center",
    location: "El Paso, El Paso County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery([{
      ...retrievedSource,
      url: "https://www.elpasotexas.gov/meta-el-paso",
      title: "Meta El Paso project agreement",
      exactProject: true,
      categoryIds: ["project-identity"],
    }]),
    cache: createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-identity-schema-")) }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    categoryIds: ["project-identity"],
    fetchImpl: async (_url, init) => {
      providerBody = JSON.parse(init.body);
      const fixture = validResearchResponse();
      return singleCallResponse({
        projectSummary: fixture.projectSummary,
        identityAssessment: {
          exactProjectIdentityEstablished: true,
          matchedName: "Meta El Paso Data Center",
          matchedLocation: "El Paso County, Texas",
          matchedOperator: "Meta",
          reason: "The official agreement identifies the project, location, and operator.",
        },
      }, [{
        ...retrievedSource,
        url: "https://www.elpasotexas.gov/meta-el-paso",
        title: "Meta El Paso project agreement",
        exactProject: true,
        categoryIds: ["project-identity"],
      }]);
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse(
      "Meta will develop the Meta El Paso Data Center in El Paso County, Texas.",
      url,
    ),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(providerBody.text.format.name, "safeloc_project_identity");
  assert.equal("evidence" in providerBody.text.format.schema.properties, false);
  assert.deepEqual(providerBody.text.format.schema.required, ["projectSummary", "identityAssessment"]);
  assert.equal(response.json().researchAudit.categories[0].categoryId, "project-identity");
});

test("retains blocked access receipts and prevents blocked passages from becoming eligible", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-blocked-access-"));
  const response = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Blocked Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    fetchImpl: async () => singleCallResponse(),
    documentFetchImpl: async () => new Response("blocked", { status: 403 }),
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.ok(body.researchAudit.candidateLineage.some((candidate) =>
    candidate.accessOutcome?.state === "blocked"));
  assert.ok(body.evidence.every((item) => !item.sources?.some((source) =>
    source.accessOutcome?.state === "blocked")));
  assert.ok(body.evidence.every((item) => item.eligibleForModel !== true));
  assert.ok(body.researchAudit.categories.every((category) => category.stageCounts.accessed === 0));
  assert.ok(body.researchAudit.categories.some((category) => category.state === "No eligible evidence" || category.state === "Partial"));
  assert.ok(body.researchAudit.outcomeMetrics.exclusions.blocked >= 1);
  assert.equal(body.researchAudit.outcomeMetrics.eligibleClaims, 0);
});

test("a finalized blocked canonical receipt is reused without another physical open", () => {
  const scheduler = createPhysicalOpenScheduler({
    maxPhysicalOpens: 2,
    activeCategoryIds: ["grid"],
  });
  const canonicalUrl = "https://records.example.gov/project/blocked";
  const first = scheduler.authorize({
    categoryId: "grid",
    canonicalUrl,
    source: { sourceRole: "grid" },
  });
  assert.equal(first.allowed, true);
  assert.equal(first.reused, false);
  scheduler.registerReceipt({
    canonicalUrl,
    receipt: { ...first, state: "blocked", reason: "http-403" },
  });

  const duplicate = scheduler.authorize({
    categoryId: "grid",
    canonicalUrl,
    source: { sourceRole: "grid" },
  });
  assert.equal(duplicate.allowed, true);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.physicalOpenIndex, first.physicalOpenIndex);
  assert.equal(scheduler.used, 1);
  assert.equal(scheduler.getReceipt(canonicalUrl).state, "blocked");
});

test("enforces per-category and run-wide candidate caps before document access", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-candidate-caps-"));
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    ...retrievedSource,
    url: `https://example.com/atlas/source-${index + 1}`,
    title: `Project Atlas public filing ${index + 1}`,
  }));
  let documentFetches = 0;
  const response = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Capped Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    fetchImpl: async () => singleCallResponse(validResearchResponse(), candidates),
    documentFetchImpl: async (url) => {
      documentFetches += 1;
      return substantiveHtmlResponse("Project Atlas filing passage.", url);
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(
    documentFetches <= RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
    true,
    "candidate access must not exceed the shared physical-document ceiling",
  );
  assert.equal(documentFetches, RESEARCH_RUN_BUDGET.maxCandidatesPerCategory);
});

test("retains and validates mapped sources from later categories after final containment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-later-category-ledger-"));
  const categoryEvidence = {
    "Project identity": null,
    Grid: "grid_interconnection",
    Electricity: "electricity_cost",
    Water: "water_consumption",
    "Permitting and community": "community_risk",
    "Construction and capital": "cooling_capex",
    "Tenant and counterparty": "customer_concentration",
    "Climate and operational hazard": "site_hazard_exposure",
  };
  const categoryIdByLabel = {
    "Project identity": "project-identity",
    Grid: "grid",
    Electricity: "electricity",
    Water: "water",
    "Permitting and community": "permitting-community",
    "Construction and capital": "construction-capital",
    "Tenant and counterparty": "tenant-counterparty",
    "Climate and operational hazard": "climate-operational-hazard",
  };
  const discoverySources = Object.keys(categoryEvidence).flatMap((label) => {
    const evidenceId = categoryEvidence[label];
    return Array.from({ length: 2 }, (_, index) => ({
      ...retrievedSource,
      url: `https://example.gov/${label.toLowerCase().replaceAll(" ", "-")}/source-${index + 1}`,
      title: `Project Atlas ${label} filing`,
      excerpt: "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
      claimPassage: "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
      claimSupport: evidenceId ? [{ evidenceId, values: [42] }] : [],
      searchDomain: categoryIdByLabel[label],
      exactProject: true,
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    }));
  });
  let providerCalls = 0;
  const response = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Ledger Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    googleDiscoveryImpl: completedGoogleDiscovery(discoverySources),
    cache: createResearchProjectCache({ directory }),
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      const payload = JSON.parse(init.body);
      const prompt = payload.input?.[1]?.content ?? "";
      const categoryId = prompt.match(/\bCategory:\s*[^\n]*\(([a-z][a-z0-9-]*)\)\./)?.[1] ?? "project-identity";
      const label = Object.keys(categoryIdByLabel).find((candidate) => categoryIdByLabel[candidate] === categoryId) ?? "Project identity";
      const evidenceId = categoryEvidence[label];
      const sourceUrl = `https://example.gov/${label.toLowerCase().replaceAll(" ", "-")}/source-1`;
      const research = validResearchResponse();
      if (evidenceId) {
        const item = research.evidence.find((candidate) => candidate.id === evidenceId);
        Object.assign(item, {
          value: 42,
          numericValue: 42,
          unit: evidenceId === "water_consumption" ? "Mgal/year" : "days",
          classification: "Management Assertion",
          sourceUrl,
          sourceUrls: [sourceUrl],
          coverageStatus: "supported",
          claimPassage: "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
          description: "The filing reports a project-specific value.",
          claimTimePeriod: "2026",
        });
      }
      const source = {
        ...retrievedSource,
        url: sourceUrl,
        title: `Project Atlas ${label} filing`,
        excerpt: "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
        claimPassage: "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
        claimSupport: evidenceId ? [{ evidenceId, values: [42] }] : [],
        facilityScope: "exact-project",
        phaseScope: "exact-phase",
        timePeriod: "2026",
      };
      return singleCallResponse(research, Array.from({ length: 2 }, (_, index) => index === 0
        ? source
        : {
          ...source,
          url: `${sourceUrl}-${index + 1}`,
          claimSupport: [],
        }));
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse(
      "Project Atlas is located in Taylor County, Texas; the filing reports 42 for the exact project.",
      url,
    ),
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.ok(providerCalls >= 3);
  assert.ok(body.researchCoverage.sourceLedgerSummary.retainedCount > 10);
  const water = body.evidence.find((item) => item.id === "water_consumption");
  assert.equal(water.eligibleForModel, true);
  assert.ok(body.sourceLedger?.some((source) => source.originalUrl?.includes("/electricity/source-")));
});

test("returns 16 normalized items without inventing custom capacity on either parse", () => {
  const response = parseResearchResponse({
    ...validResearchResponse(),
    projectSummary: { ...validResearchResponse().projectSummary, capacityMW: Number.NaN },
  });
  assert.equal(response.evidence.length, 16);
  assert.deepEqual(response.evidence.map((item) => item.id), RESEARCH_EVIDENCE_IDS);
  assert.equal(response.projectSummary.capacityMW, null);
  assert.equal(response.projectSummary.capacityProvenance, "unknown");
  const secondParse = parseResearchResponse(response);
  assert.equal(secondParse.projectSummary.capacityMW, null);
  assert.equal(secondParse.projectSummary.capacityProvenance, "unknown");
  const oldFallback = parseResearchResponse({
    ...validResearchResponse(),
    projectSummary: { ...validResearchResponse().projectSummary, capacityMW: 1_200, capacityProvenance: "standardized-default" },
  });
  assert.equal(oldFallback.projectSummary.capacityMW, null);
  assert.equal(oldFallback.projectSummary.capacityProvenance, "unknown");
  const reportedCapacity = parseResearchResponse({
    ...validResearchResponse(),
    projectSummary: { ...validResearchResponse().projectSummary, capacityMW: 600 },
  }, [retrievedSource]);
  assert.equal(reportedCapacity.projectSummary.capacityMW, 600);
  assert.equal(reportedCapacity.projectSummary.capacityProvenance, "ai-reported");
  for (const invalidCapacity of [0, -1, Number.POSITIVE_INFINITY, MAX_RESEARCH_CAPACITY_MW + 1, "2000 MW"]) {
    assert.equal(normalizeReportedCapacityMW(invalidCapacity), null);
    assert.equal(normalizeCapacityMW(invalidCapacity), DEFAULT_RESEARCH_CAPACITY_MW);
  }
});

test("Red Oak passage scope is merged before proxy claim mapping", () => {
  const mapRedOakClaim = ({
    value,
    passage,
    aiFacilityScope = "unknown",
    aiPhaseScope = "unknown",
    aiClaimTimePeriod = null,
    sourceFacilityScope = "unknown",
    sourcePhaseScope = "unknown",
    sourceTimePeriod = null,
  }) => {
    const body = validResearchResponse();
    body.projectSummary = {
      ...body.projectSummary,
      name: "Red Oak Campus",
      location: "Red Oak, Texas",
    };
    const item = body.evidence.find((candidate) => candidate.id === "grid_interconnection");
    const url = `https://records.example.test/redoak/${value}`;
    const retainedPassage = `${passage} The DataBank Red Oak data center campus is located in Red Oak, Texas.`;
    Object.assign(item, {
      value,
      numericValue: value,
      unit: "MW",
      classification: "Management Assertion",
      sourceUrl: url,
      sourceUrls: [url],
      coverageStatus: "supported",
      claimPassage: retainedPassage,
      facilityScope: aiFacilityScope,
      phaseScope: aiPhaseScope,
      claimTimePeriod: aiClaimTimePeriod,
    });
    const parsed = parseResearchResponse(body, [withRetrievedPassage({
      ...retrievedSource,
      url,
      title: "Red Oak capacity disclosure",
      excerpt: retainedPassage,
      claimPassage: retainedPassage,
      sourceClass: "primary-government",
      exactProject: true,
      claimSupport: [{ evidenceId: "grid_interconnection", values: [value] }],
      facilityScope: sourceFacilityScope,
      phaseScope: sourcePhaseScope,
      timePeriod: sourceTimePeriod,
    }, retainedPassage)], null, null, {
      aliases: ["Red Oak"],
      operator: "DataBank",
      city: "Red Oak",
      state: "Texas",
    });
    const evidence = parsed.evidence.find((candidate) => candidate.id === "grid_interconnection");
    return { evidence, mapping: evidence.claimMappings[0] };
  };

  const campusTotal = mapRedOakClaim({
    value: 480,
    passage: "Red Oak campus has a total capacity of 480 MW across all phases. Phase One, comprising DFW9, DFW10, and DFW11, has 180 MW across three buildings.",
  });
  assert.equal(campusTotal.evidence.facilityScope, "project");
  assert.equal(campusTotal.evidence.phaseScope, "all-phases");
  assert.equal(campusTotal.evidence.claimTimePeriod, null);
  assert.equal(campusTotal.mapping.facilityScope, "project");
  assert.equal(campusTotal.mapping.phaseScope, "all-phases");
  assert.equal(campusTotal.mapping.timePeriod, null);
  assert.equal(campusTotal.mapping.supportStatus, "scope-unknown");

  const conflictingFacilityScope = mapRedOakClaim({
    value: 480,
    passage: "Red Oak campus has a total capacity of 480 MW across all phases.",
    aiFacilityScope: "exact-facility",
  });
  assert.equal(conflictingFacilityScope.evidence.facilityScope, "unknown");
  assert.equal(conflictingFacilityScope.mapping.facilityScope, "unknown");

  const conflictingPeriod = mapRedOakClaim({
    value: 480,
    passage: "As of 2026, Red Oak campus has a total capacity of 480 MW across all phases.",
    aiClaimTimePeriod: "2025",
    sourceTimePeriod: "2025",
  });
  assert.equal(conflictingPeriod.evidence.claimTimePeriod, null);
  assert.equal(conflictingPeriod.mapping.timePeriod, null);
  assert.equal(conflictingPeriod.mapping.supportStatus, "scope-unknown");

  const exactPhase = mapRedOakClaim({
    value: 180,
    passage: "Red Oak campus totals 480 MW. Phase One, comprising DFW9, DFW10, and DFW11, has 180 MW across three buildings.",
    aiClaimTimePeriod: "2026",
  });
  assert.equal(exactPhase.evidence.phaseScope, "exact-phase");
  assert.match(exactPhase.evidence.phaseIdentity, /DFW9\/DFW10\/DFW11/);
  assert.match(exactPhase.mapping.phaseIdentity, /3 buildings/);
  assert.equal(exactPhase.mapping.timePeriod, "2026");
  assert.equal(exactPhase.mapping.supportStatus, "supported");

  const campusWideAiClaimForPhaseValue = mapRedOakClaim({
    value: 180,
    passage: "Red Oak campus totals 480 MW. Phase One, comprising DFW9, DFW10, and DFW11, has 180 MW across three buildings.",
    aiFacilityScope: "exact-project",
    aiPhaseScope: "all-phases",
    aiClaimTimePeriod: "2026",
  });
  assert.equal(campusWideAiClaimForPhaseValue.evidence.phaseScope, "unknown");
  assert.equal(campusWideAiClaimForPhaseValue.evidence.phaseIdentity, null);
  assert.equal(campusWideAiClaimForPhaseValue.mapping.phaseScope, "unknown");
  assert.equal(campusWideAiClaimForPhaseValue.mapping.supportStatus, "scope-unknown");

  const noScope = mapRedOakClaim({
    value: 180,
    passage: "The filing lists an approved load of 180 MW.",
  });
  assert.equal(noScope.evidence.facilityScope, "unknown");
  assert.equal(noScope.evidence.phaseScope, "unknown");
  assert.equal(noScope.mapping.phaseScope, "unknown");
  assert.equal(noScope.mapping.supportStatus, "scope-unknown");
});

test("generic Red Oak passage without operator attribution remains context-only", () => {
  const body = validResearchResponse();
  body.projectSummary = {
    ...body.projectSummary,
    name: "Red Oak Campus",
    location: "Red Oak, Texas",
  };
  const item = body.evidence.find((candidate) => candidate.id === "grid_interconnection");
  const value = 480;
  const url = "https://records.example.test/redoak/generic-campus";
  const passage = "Red Oak campus has a total capacity of 480 MW across all phases. The Red Oak campus is located in Red Oak, Texas.";
  Object.assign(item, {
    value,
    numericValue: value,
    unit: "MW",
    classification: "Management Assertion",
    sourceUrl: url,
    sourceUrls: [url],
    coverageStatus: "supported",
    claimPassage: passage,
    facilityScope: "project",
    phaseScope: "all-phases",
    claimTimePeriod: null,
  });
  const parsed = parseResearchResponse(body, [withRetrievedPassage({
    ...retrievedSource,
    url,
    title: "Generic Red Oak capacity disclosure",
    excerpt: passage,
    claimPassage: passage,
    sourceClass: "primary-government",
    exactProject: true,
    claimSupport: [{ evidenceId: "grid_interconnection", values: [value] }],
    facilityScope: "project",
    phaseScope: "all-phases",
  }, passage)], null, null, {
    aliases: ["Red Oak"],
    operator: "DataBank",
    city: "Red Oak",
    state: "Texas",
  });
  const evidence = parsed.evidence.find((candidate) => candidate.id === "grid_interconnection");
  assert.equal(evidence.claimMappings[0].supportStatus, "context-only");
});

test("Project Kilby preserves supported power, grid, and water classifications from validated sources", () => {
  const body = validResearchResponse();
  body.projectSummary = {
    name: "Project Kilby",
    location: "Reeves County, Texas",
    description: "Public records describe behind-the-meter generation, a company power agreement, and a brackish groundwater supply.",
    capacityMW: 2_000,
  };
  const sources = [
    {
      url: "https://www.sec.gov/Archives/edgar/data/kilby/8-k",
      title: "Chevron 8-K project disclosure",
      excerpt: "The filing describes Project Kilby power plans in Reeves County, Texas and reports a 48 USD/MWh facility tariff.",
      sourceClass: "primary-government",
      searchDomain: "project-identity",
      exactProject: true,
      claimSupport: [{ evidenceId: "electricity_cost", value: "48 USD/MWh" }],
      facilityScope: "exact-facility",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    },
    {
      url: "https://www.ercot.com/gridinfo/project-kilby",
      title: "ERCOT Project Kilby grid record",
      excerpt: "Project Kilby is located in Reeves County, Texas; the facility is behind-the-meter generation and does not depend on a new ERCOT interconnection.",
      sourceClass: "primary-government",
      searchDomain: "power-grid",
      exactProject: true,
      claimSupport: [{ evidenceId: "grid_interconnection", value: "behind-the-meter generation" }],
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    },
    {
      url: "https://www.texaspacific.com/project-kilby-water",
      title: "Texas Pacific Land water disclosure",
      excerpt: "Project Kilby is located in Reeves County, Texas and plans to use brackish groundwater.",
      sourceClass: "primary-company",
      searchDomain: "water-environment",
      exactProject: true,
      claimSupport: [{ evidenceId: "water_source_resilience", value: "brackish groundwater" }],
      facilityScope: "exact-facility",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    },
  ].map((source, index) => withRetrievedPassage(source, source.excerpt, index + 1));
  const power = body.evidence.find((item) => item.id === "electricity_cost");
  power.classification = "Management Assertion";
  power.value = 48;
  power.numericValue = 48;
  power.sourceUrl = sources[0].url;
  power.sourceUrls = [sources[0].url];
  power.citation = `Chevron describes the power arrangement: ${sources[0].url}`;
  power.claimPassage = sources[0].excerpt;
  power.facilityScope = "exact-facility";
  power.phaseScope = "exact-phase";
  power.claimTimePeriod = "2026";
  const grid = body.evidence.find((item) => item.id === "grid_interconnection");
  grid.classification = "Verified Evidence";
  grid.value = "Behind-the-meter generation";
  grid.numericValue = 0;
  grid.sourceUrl = sources[1].url;
  grid.sourceUrls = [sources[1].url];
  grid.citation = `ERCOT records the grid arrangement: ${sources[1].url}`;
  grid.claimPassage = sources[1].excerpt;
  grid.facilityScope = "exact-project";
  grid.phaseScope = "exact-phase";
  grid.claimTimePeriod = "2026";
  const water = body.evidence.find((item) => item.id === "water_source_resilience");
  water.classification = "Management Assertion";
  water.value = "Brackish groundwater";
  water.qualitativeValue = "single-source";
  water.sourceUrl = sources[2].url;
  water.sourceUrls = [sources[2].url];
  water.citation = `The water source is disclosed here: ${sources[2].url}`;
  water.claimPassage = sources[2].excerpt;
  water.facilityScope = "exact-facility";
  water.phaseScope = "exact-phase";
  water.claimTimePeriod = "2026";

  const parsed = parseResearchResponse(body, sources);
  assert.equal(parsed.projectSummary.capacityMW, 2_000);
  assert.equal(parsed.projectSummary.capacityProvenance, "ai-reported");
  assert.equal(parsed.evidence.find((item) => item.id === "electricity_cost").classification, "Management Assertion");
  assert.equal(parsed.evidence.find((item) => item.id === "grid_interconnection").classification, "Verified Evidence");
  assert.equal(parsed.evidence.find((item) => item.id === "water_source_resilience").classification, "Management Assertion");
  assert.equal(parsed.evidence.find((item) => item.id === "electricity_cost").sourceUrl, sources[0].url);
  assert.equal(parsed.evidence.find((item) => item.id === "grid_interconnection").sourceUrl, sources[1].url);
  assert.equal(parsed.evidence.find((item) => item.id === "water_source_resilience").sourceUrl, sources[2].url);
  assert.equal(parsed.evidence.find((item) => item.id === "water_consumption").classification, "Missing Evidence");
});

test("normalizes the strict keyed evidence contract and ignores nullable optional values", () => {
  const arrayResponse = validResearchResponse();
  const keyedResponse = {
    projectSummary: arrayResponse.projectSummary,
    evidence: Object.fromEntries(arrayResponse.evidence.map(({ id, ...record }) => [
      id,
      { ...record, sourceUrl: null, numericValue: null, qualitativeValue: null },
    ])),
  };
  const response = parseResearchResponse(keyedResponse);
  assert.equal(response.evidence.length, 16);
  assert.deepEqual(response.evidence.map((item) => item.id), RESEARCH_EVIDENCE_IDS);
  assert.equal(response.evidence[0].numericValue, undefined);
  assert.equal(response.evidence[0].qualitativeValue, undefined);
});

test("recontains converted research from raw fields without double conversion", () => {
  const body = validResearchResponse();
  const timeline = body.evidence.find((item) => item.id === "grid_interconnection");
  timeline.value = 365;
  timeline.unit = "days";
  timeline.numericValue = 365;
  timeline.classification = "Management Assertion";
  timeline.sourceUrl = retrievedSource.url;
  timeline.sourceUrls = [retrievedSource.url];
  timeline.citation = `Project milestone: ${retrievedSource.url}`;
  const source = withRetrievedPassage(retrievedSource);
  const first = parseResearchResponse(body, [source]);
  const second = parseResearchResponse(first, [source]);
  const firstTimeline = first.evidence.find((item) => item.id === "grid_interconnection");
  const secondTimeline = second.evidence.find((item) => item.id === "grid_interconnection");
  assert.equal(firstTimeline.normalizedUnit, "months");
  assert.equal(secondTimeline.normalizedUnit, "months");
  assert.equal(secondTimeline.normalizedValue, firstTimeline.normalizedValue);
  assert.equal(secondTimeline.numericValue, firstTimeline.numericValue);
  assert.equal(secondTimeline.rawValue, 365);
  assert.equal(secondTimeline.rawUnit, "days");
});

test("keeps a complete response when missing-evidence narrative fields are empty", () => {
  const body = validResearchResponse();
  body.evidence[0] = {
    ...body.evidence[0],
    label: "",
    value: "",
    unit: "",
    citation: "",
    description: "",
    sourceRole: "",
    sourceUrl: null,
  };
  const response = parseResearchResponse(body, [retrievedSource]);
  assert.equal(response.evidence.length, 16);
  assert.equal(response.evidence[0].classification, "Missing Evidence");
  assert.equal(response.evidence[0].value, "Not established");
  assert.match(response.evidence[0].citation, /No supporting retrieved source/);
  assert.match(response.evidence[0].description, /did not establish/i);
});

test("only exposes direct links that are safe and present in the retrieved source packet", () => {
  const source = withRetrievedPassage(retrievedSource);
  const parsed = parseResearchResponse(validResearchResponse(), [source], "2026-08-30");
  assert.equal(parsed.evidence[0].sourceUrl, retrievedSource.url);
  assert.equal(parsed.evidence[1].sourceUrl, retrievedSource.url);
  assert.equal(parsed.evidence[0].sourceTitle, retrievedSource.title);
  assert.equal(parsed.evidence[0].sourcePublisher, "example.com");
  assert.equal(parsed.evidence[0].sourcePublishedAt, "2026-06-01");
  assert.equal(parsed.evidence[0].sourceAccessedAt, null);
  assert.equal(parsed.evidence[0].sourceAccessStatus, "not provided");

  const redirectedPublicationSource = {
    ...retrievedSource,
    url: "https://example.com/atlas/source?utm_source=offline-fixture",
    canonicalUrl: "https://example.com/atlas/source",
    date: null,
    publishedAt: null,
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      resolvedUrl: "https://example.com/atlas/source?redirected=1",
      canonicalUrl: "https://example.com/atlas/source",
      retrievalTime: "2026-04-24T10:00:00.000Z",
      publicationDate: "2026-04-23",
      publicationDateBasis: "semantic-metadata",
      publicationDateStatus: "resolved",
      passage: retrievedSource.claimPassage,
    },
  };
  const redirectedParsed = parseResearchResponse(validResearchResponse(), [redirectedPublicationSource]);
  assert.equal(redirectedParsed.evidence[0].sourceUrl, "https://example.com/atlas/source");
  assert.equal(redirectedParsed.evidence[0].sourcePublishedAt, "2026-04-23");
  assert.equal(redirectedParsed.evidence[0].sourcePublishedAtBasis, "semantic-metadata");
  assert.equal(redirectedParsed.evidence[0].sourceAccessedAt, "2026-04-24");

  const conflictingPublicationSource = {
    ...redirectedPublicationSource,
    date: "2026-03-14",
    accessOutcome: {
      ...redirectedPublicationSource.accessOutcome,
      publicationDate: null,
      publicationDateBasis: null,
      publicationDateStatus: "ambiguous",
    },
  };
  const conflictingPublication = parseResearchResponse(validResearchResponse(), [conflictingPublicationSource]);
  assert.equal(conflictingPublication.evidence[0].sourcePublishedAt, null);
  assert.equal(conflictingPublication.evidence[0].sourcePublishedAtBasis, "ambiguous-publication-metadata");
  assert.equal(conflictingPublication.evidence[0].sourceAccessedAt, "2026-04-24");

  const untrusted = validResearchResponse();
  untrusted.evidence[0].sourceUrl = "javascript:alert(1)";
  untrusted.evidence[1].sourceUrl = "https://example.com/not-in-packet";
  const untrustedParsed = parseResearchResponse(untrusted, [source]);
  assert.equal(untrustedParsed.evidence[0].sourceUrl, retrievedSource.url);
  assert.equal(untrustedParsed.evidence[1].sourceUrl, retrievedSource.url);

  assert.equal(safePublicSourceUrl("javascript:alert(1)"), null);
  assert.equal(safePublicSourceUrl("https://user:pass@example.com/source"), null);
  assert.equal(safePublicSourceUrl("https://example.com/source"), "https://example.com/source");
});

test("does not turn an AI Missing Evidence result into facility-level evidence", () => {
  const body = validResearchResponse();
  body.evidence[0].citation = "Regional market report without a matching packet URL.";
  body.evidence[0].sourceUrl = "https://example.com/not-in-packet";
  const parsed = parseResearchResponse(body, [retrievedSource]);
  assert.equal(parsed.evidence[0].classification, "Missing Evidence");
  assert.equal(parsed.evidence[0].sourceUrl, undefined);
  assert.match(parsed.evidence[0].citation, /No validated source match/);
});

test("preserves conservative AI classifications and downgrades unmatched Verified Evidence", () => {
  const body = validResearchResponse();
  body.evidence[0].classification = "Verified Evidence";
  body.evidence[0].citation = "Invented filing with no URL";
  body.evidence[0].numericValue = 1;
  body.evidence[1].value = "Company-reported arrangement";
  body.evidence[3].value = "Analyst-estimated escalation";
  body.evidence[12].qualitativeValue = "low";
  const parsed = parseResearchResponse(body, []);
  assert.equal(parsed.evidence[0].classification, "Management Assertion");
  assert.match(parsed.evidence[0].citation, /AI classification downgraded.*Original classification: Verified Evidence/);
  assert.equal(parsed.evidence[0].coverageStatus, "partial");
  assert.equal(parsed.evidence[0].numericValue, undefined);
  assert.equal(parsed.evidence[12].qualitativeValue, undefined);
  assert.equal(parsed.evidence[1].classification, "Management Assertion");
  assert.equal(parsed.evidence[1].coverageStatus, "partial");
  assert.match(parsed.evidence[1].citation, /Based on AI training knowledge.*Verify before relying/);
  assert.equal(parsed.evidence[3].classification, "Management Assertion");
});

test("maps explicit unknown values to Missing Evidence", () => {
  const body = validResearchResponse();
  const target = body.evidence[1];
  target.classification = "Management Assertion";
  target.value = "Not publicly available";
  target.sourceUrl = retrievedSource.url;
  target.sourceUrls = [retrievedSource.url];
  const parsed = parseResearchResponse(body, [retrievedSource]);
  const record = parsed.evidence[1];
  assert.equal(record.classification, "Missing Evidence");
  assert.equal(record.value, "Not established");
  assert.match(record.citation, /explicitly unavailable/i);
});

test("rejects invalid classification strings instead of silently defaulting them", () => {
  const body = validResearchResponse();
  body.evidence[0].classification = "verified-evidence";
  assert.throws(() => parseResearchResponse(body, [retrievedSource]), /invalid classification/i);
});

test("ranks a project-specific regulatory decision ahead of trade reporting and preserves corroboration", () => {
  const body = validResearchResponse();
  const target = body.evidence.find((item) => item.id === "carbon_compliance");
  target.sourceUrl = "https://datacenter.example.com/project-atlas";
  target.sourceUrls = [
    "https://datacenter.example.com/project-atlas",
    "https://dnr.alaska.gov/mlw/decision/project-atlas",
  ];
  target.coverageStatus = "supported";
  target.citation = "The Alaska DNR decision establishes the project-specific land condition.";
  const result = parseResearchResponse(body, [
    {
      url: "https://datacenter.example.com/project-atlas",
      title: "Project Atlas compliance coverage",
      excerpt: "Trade reporting summarizes environmental questions at Project Atlas in Taylor County, Texas.",
      sourceClass: "secondary-reporting",
      searchDomain: "water-environment",
    },
    {
      url: "https://dnr.alaska.gov/mlw/decision/project-atlas",
      title: "Alaska DNR final decision for Project Atlas",
      excerpt: "Final agency decision for the exact Project Atlas site in Taylor County, Texas.",
      sourceClass: "primary-government",
      searchDomain: "water-environment",
    },
  ].map((source, index) => withRetrievedPassage(source, source.excerpt, index + 1)));
  const record = result.evidence.find((item) => item.id === "carbon_compliance");
  assert.equal(record.sourceUrl, "https://dnr.alaska.gov/mlw/decision/project-atlas");
  assert.equal(record.sources.length, 2);
  assert.equal(record.sources[0].sourceClass, "primary-government");
  assert.equal(record.sources[1].relationship, "corroborating");
});

test("preserves conflicting sources and exposes incomplete search coverage", () => {
  const body = validResearchResponse();
  const target = body.evidence.find((item) => item.id === "water_rights");
  target.sourceUrl = "https://county.gov/project-atlas/permit";
  target.sourceUrls = ["https://county.gov/project-atlas/permit", "https://utility.example.com/project-atlas"];
  target.coverageStatus = "conflicting";
  target.conflictSummary = "The county permit and utility filing publish different water volumes.";
  const coverage = { searchedDomains: ["project-identity", "water-environment"], failedDomains: ["power-grid"] };
  const result = parseResearchResponse(body, [
    { url: target.sourceUrls[0], title: "County permit", excerpt: "Permit volume", sourceClass: "primary-government", searchDomain: "water-environment" },
    { url: target.sourceUrls[1], title: "Utility filing", excerpt: "Different volume", sourceClass: "primary-utility", searchDomain: "water-environment" },
  ], "2026-09-03", coverage);
  const record = result.evidence.find((item) => item.id === "water_rights");
  assert.equal(record.coverageStatus, "conflicting");
  assert.match(record.conflictSummary, /different water volumes/i);
  assert.deepEqual(record.failedSearchDomains, ["power-grid"]);
  assert.equal(record.sources[1].relationship, "conflicting");
});

test("does not convert source silence into a modeled zero", () => {
  const body = validResearchResponse();
  const target = body.evidence.find((item) => item.id === "renewable_percentage");
  target.value = "0";
  target.numericValue = 0;
  target.classification = "Verified Evidence";
  target.sourceUrl = "https://utility.example.com/project-atlas";
  target.sourceUrls = [target.sourceUrl];
  target.citation = "The filing discusses energy supply but does not disclose renewable procurement.";
  const result = parseResearchResponse(body, [{
    url: target.sourceUrl,
    title: "Project Atlas energy filing",
    excerpt: "The project expects grid-delivered power.",
    sourceClass: "primary-utility",
    searchDomain: "power-grid",
  }]);
  const record = result.evidence.find((item) => item.id === "renewable_percentage");
  assert.equal(record.classification, "Missing Evidence");
  assert.equal(record.value, "Not established");
  assert.equal("numericValue" in record, false);
});

test("rejects an incomplete provider response without leaking provider details", async () => {
  const response = responseRecorder();
  const cache = createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-research-incomplete-")) });
  const incomplete = validResearchResponse();
  incomplete.evidence = incomplete.evidence.slice(0, 15);
    await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    cache,
    fetchImpl: async (_, init) => {
      assert.match(init.body, /web_search_preview/);
      return singleCallResponse(incomplete);
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().researchStatus, "partial");
  assert.equal(response.json().researchError.type, "malformed-response");
  assert.equal(response.json().evidence.length, 16);
  assert.ok(response.json().evidence.some((item) => item.classification === "Missing Evidence"));
  assert.doesNotMatch(response.body, /server-secret-for-test/i);
});

test("returns specific safe quota, authentication, parse, and timeout errors", async () => {
  const cache = createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-research-errors-")) });
  const rateLimiter = createResearchProjectRateLimiter({ limit: 10, windowMs: 60_000 });
  const providerResponse = responseRecorder();
  let persistedFailure;
  const savedFailure = new Promise((resolve) => { persistedFailure = resolve; });
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), providerResponse, {
    apiKey: "server-secret-for-test",
    cache,
    rateLimiter,
    auditRepository: { save: async (record) => {
      assert.ok(providerResponse.body, "failed-run audit persistence must not hold the response open");
      persistedFailure(record);
    } },
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: "Billing allocation reached.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    }), { status: 429, headers: { "content-type": "application/json" } }),
  });
  assert.equal(providerResponse.statusCode, 429);
  const failedRecord = await savedFailure;
  assert.equal(failedRecord.researchStatus, "failed");
  assert.equal(failedRecord.audit.terminalState, "incomplete-technical-limitation");
  assert.ok(Array.isArray(failedRecord.audit.providerAttempts));
  assert.match(providerResponse.body, /insufficient quota or a billing limit/i);
  assert.equal(providerResponse.json().errorType, "quota-exhausted");
  assert.equal(providerResponse.json().providerDiagnostic.errorCode, "insufficient_quota");
  assert.doesNotMatch(providerResponse.body, /server-secret-for-test/i);

  const authenticationResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), authenticationResponse, {
    apiKey: "server-secret-for-test",
    cache,
    rateLimiter,
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }),
  });
  assert.equal(authenticationResponse.statusCode, 502);
  assert.match(authenticationResponse.body, /authentication failed.*401/i);
  assert.doesNotMatch(authenticationResponse.body, /invalid key|server-secret-for-test/i);

  const parseResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), parseResponse, {
    apiKey: "server-secret-for-test",
    cache,
    rateLimiter,
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });
  assert.equal(parseResponse.statusCode, 200);
  assert.equal(parseResponse.json().researchStatus, "partial");
  assert.equal(parseResponse.json().researchError.type, "malformed-response");
  assert.equal(parseResponse.json().evidence.length, 16);

  const timeoutResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), timeoutResponse, {
    apiKey: "server-secret-for-test",
    cache,
    rateLimiter,
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  assert.equal(timeoutResponse.statusCode, 200);
  assert.equal(timeoutResponse.json().researchStatus, "partial");
  assert.equal(timeoutResponse.json().researchError.type, "timeout");
  assert.equal(timeoutResponse.json().evidence.length, 16);
});

test("HTTP research records an independent provider failure for every category without losing retained receipts", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const categoryIds = [
    "project-identity",
    "grid",
    "electricity",
    "water",
    "permitting-community",
    "construction-capital",
    "tenant-counterparty",
    "climate-operational-hazard",
  ];
  const candidate = {
    ...fixture.accessibleReceipt,
    categoryIds,
    excerpt: fixture.accessibleReceipt.passage,
  };
  const response = responseRecorder();
  let providerCalls = 0;
  await handleResearchProjectRequest(request({ ...fixture.project, forceRefresh: true }), response, {
    apiKey: "synthetic-test-key",
    cache: createResearchProjectCache({
      directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-all-category-failures-")),
    }),
    registry: { retain: async () => {} },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds,
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    researchTimeoutMs: 5_000,
    analysisReserveMs: 100,
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    secConnector: { search: async () => ({ attempts: [], candidates: [] }) },
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ error: { message: "synthetic provider unavailable" } }), { status: 503 });
    },
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
  });
  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(payload.researchStatus, "partial");
  assert.equal(providerCalls, categoryIds.length);
  assert.deepEqual(
    payload.researchAudit.categories.map((category) => category.categoryId).sort(),
    [...categoryIds].sort(),
  );
  assert.ok(payload.researchAudit.categories.every((category) => category.state !== "Complete"));
  assert.ok(payload.sourceLedger.some((source) => source.accessOutcome?.state === "accessible"));
});

test("HTTP research deadline aborts a stalled provider and returns a typed timeout", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = {
    ...fixture.accessibleReceipt,
    categoryIds: ["water"],
    excerpt: fixture.accessibleReceipt.passage,
  };
  const response = responseRecorder();
  let persisted;
  const saved = new Promise((resolve) => { persisted = resolve; });
  const startedAt = Date.now();
  let providerSignal;
  await handleResearchProjectRequest(request({ ...fixture.project, forceRefresh: true }), response, {
    apiKey: "synthetic-test-key",
    cache: createResearchProjectCache({
      directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-handler-deadline-")),
    }),
    registry: { retain: async () => {} },
    auditRepository: { save: async (record) => {
      assert.ok(response.body, "the partial response must precede persistence");
      persisted(record);
    } },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    // Leave enough time for admission, then exercise cancellation of an
    // actually issued request rather than the minimum-response-time gate.
    researchTimeoutMs: 1_500,
    analysisReserveMs: 0,
    documentTimeoutMs: 10,
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    secConnector: { search: async () => ({ attempts: [], candidates: [] }) },
    documentFetchImpl: async (url) => substantiveHtmlResponse(fixture.accessibleReceipt.passage, url),
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      providerSignal = init.signal;
      const fail = () => reject(Object.assign(new Error("synthetic deadline"), { name: "AbortError" }));
      if (init.signal.aborted) fail();
      else init.signal.addEventListener("abort", fail, { once: true });
    }),
  });
  const payload = response.json();
  const record = await saved;
  assert.equal(response.statusCode, 200);
  assert.equal(payload.researchStatus, "partial");
  assert.ok(Date.now() - startedAt < 90_000);
  assert.equal(record.researchStatus, "partial");
  assert.equal(payload.researchError.type, "timeout");
  assert.equal(providerSignal?.aborted, true);
});

test("HTTP client abort cancels a stalled document body and suppresses the response", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/research-partial-receipts.json", import.meta.url), "utf8"));
  const candidate = {
    ...fixture.accessibleReceipt,
    excerpt: fixture.accessibleReceipt.passage,
  };
  let aborted;
  let bodyPullStarted;
  let bodyCancelled = false;
  let fetchSignal;
  const bodyReadStarted = new Promise((resolve) => { bodyPullStarted = resolve; });
  const req = {
    method: "POST",
    body: { ...fixture.project, forceRefresh: true },
    ip: "198.51.100.31",
    listeners: new Map(),
    once(event, listener) {
      this.listeners.set(event, listener);
      return this;
    },
    removeListener(event, listener) {
      if (this.listeners.get(event) === listener) this.listeners.delete(event);
      return this;
    },
    emitAborted() {
      this.listeners.get("aborted")?.();
    },
  };
  const response = responseRecorder();
  response.destroyed = false;
  response.writableEnded = false;
  const pending = handleResearchProjectRequest(req, response, {
    apiKey: "synthetic-test-key",
    cache: createResearchProjectCache({
      directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-handler-abort-")),
    }),
    registry: { retain: async () => {} },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    categoryIds: ["water"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    researchTimeoutMs: 5_000,
    analysisReserveMs: 100,
    googleDiscoveryImpl: completedGoogleDiscovery([candidate]),
    secConnector: { search: async () => ({ attempts: [], candidates: [] }) },
    fetchImpl: async () => {
      throw new Error("Provider work must not begin after document cancellation.");
    },
    documentFetchImpl: async (_url, init) => {
      fetchSignal = init.signal;
      init.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      return new Response(new ReadableStream({
        pull() {
          bodyPullStarted();
        },
        cancel() {
          bodyCancelled = true;
        },
      }), { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  await bodyReadStarted;
  response.destroyed = true;
  req.emitAborted();
  await pending;
  assert.equal(fetchSignal?.aborted, true);
  assert.equal(aborted, true);
  assert.equal(bodyCancelled, true);
  assert.equal(response.body, "");
});

test("cached evidence with only a mapped navigation passage is quarantined at server containment", () => {
  const url = "https://records.example.test/atlas/navigation-only";
  const navigation = "Home Projects News Contact Privacy Terms About Us";
  const source = {
    ...categorySource(url),
    excerpt: navigation,
    claimPassage: navigation,
    accessOutcome: { state: "accessible", reason: "retrieved", passage: navigation },
  };
  const evidence = categoryMappedResearch("electricity_cost", url, 42).evidence.find((item) =>
    item.id === "electricity_cost");
  Object.assign(evidence, {
    classification: "Management Assertion",
    coverageStatus: "supported",
    sourceRelevance: "exact-project",
    sourceSupportConfidence: 95,
    claimPassage: navigation,
    sources: [source],
    claimMappings: buildClaimPassageMappings({
      id: "electricity_cost",
      sources: [source],
      project: { name: "Project Atlas", location: "Phoenix, Arizona" },
      claim: {
        value: 42,
        unit: "$/MWh",
        claimPassage: navigation,
        facilityScope: "exact-project",
        phaseScope: "exact-phase",
        claimTimePeriod: "2026",
      },
    }),
  });

  const contained = containResearchResult({ evidence: [evidence] }).evidence[0];
  assert.equal(contained.eligibleForModel, false);
  assert.deepEqual(contained.sources, []);
  assert.ok(contained.quarantineReasons.some((reason) => /navigation-only-content/.test(reason)));
  assert.equal(contained.sourceValidation.eligibilityTrace.checks[0].id, "content-quality");
  assert.equal(contained.sourceValidation.eligibilityTrace.checks[0].passed, false);
});

test("claim audit reviews reuse the policy trace for not-applicable phase scope and rejection", () => {
  const url = "https://records.example.test/northstar/electricity";
  const passage = "Northstar Campus is located in Texas and pays a facility electricity cost of 42 USD/MWh.";
  const source = {
    url,
    canonicalUrl: url,
    resolvedUrl: url,
    title: "Northstar Campus electricity filing",
    sourceClass: "primary-company",
    exactProject: true,
    facilityScope: "exact-facility",
    phaseScope: "not-applicable",
    timePeriod: "2026",
    excerpt: passage,
    claimPassage: passage,
    claimSupport: [{ evidenceId: "electricity_cost", values: [42] }],
    accessOutcome: { state: "accessible", passage },
  };
  const description = "The campus electricity cost is 42 USD/MWh.";
  const claimMappings = buildClaimPassageMappings({
    id: "electricity_cost",
    sources: [source],
    project: { name: "Northstar Campus", location: "Texas" },
    claim: {
      description,
      value: 42,
      numericValue: 42,
      sourceRelevance: "exact-project",
    },
    coverageStatus: "supported",
  });
  assert.equal(claimMappings[0].supportStatus, "supported");

  const policyInput = {
    id: "electricity_cost",
    sourceUrl: url,
    sources: [source],
    sourceRelevance: "exact-project",
    sourceSupportConfidence: 94,
    classification: "Management Assertion",
    coverageStatus: "supported",
    claimMappings,
  };
  const eligibleDecision = evaluateResearchEvidenceEligibility(policyInput);
  const tracedEligibleDecision = evaluateResearchEvidenceEligibility(policyInput, { includeCheckTrace: true });
  const { checkTrace: _eligibleTrace, ...eligibleOutcome } = tracedEligibleDecision;
  assert.deepEqual(eligibleOutcome, eligibleDecision);
  assert.equal(tracedEligibleDecision.eligible, true);
  assert.equal(tracedEligibleDecision.checkTrace.firstFailure, null);
  assert.ok(tracedEligibleDecision.checkTrace.checks.length > 0);
  assert.ok(tracedEligibleDecision.checkTrace.checks.every((check) => check.passed && check.reason));

  const claim = {
    ...policyInput,
    id: "electricity_cost",
    value: 42,
    numericValue: 42,
    unit: "USD/MWh",
    classification: "Management Assertion",
    citation: "Northstar Campus filing.",
    description,
    claimPassage: passage,
    sources: [source],
  };
  const acceptedEvidence = containResearchResult({ evidence: [claim] }).evidence;
  const acceptedTrace = acceptedEvidence[0].sourceValidation.eligibilityTrace;
  const acceptedSemanticCheck = acceptedTrace.checks.at(-1);
  assert.equal(acceptedSemanticCheck.id, "semantic-validation");
  assert.equal(acceptedSemanticCheck.passed, true);
  assert.ok(acceptedSemanticCheck.reason);
  const acceptedAudit = buildResearchAudit({
    project: { name: "Northstar Campus", location: "Texas" },
    evidence: acceptedEvidence,
    sources: [source],
  });
  const acceptedReview = acceptedAudit.eligibilityReview.claims[0];
  assert.equal(acceptedEvidence[0].eligibleForModel, true);
  assert.ok(acceptedReview.gates.length > 0);
  assert.ok(acceptedReview.gates.every((check) => check.passed && check.reason));
  assert.equal(acceptedReview.firstFailure, null);
  assert.equal(acceptedReview.firstFailedGate, null);

  const assertSemanticRejectionTrace = (record) => {
    const trace = record.sourceValidation.eligibilityTrace;
    const semanticCheck = trace.checks.at(-1);
    assert.equal(record.eligibleForModel, false);
    assert.equal(semanticCheck.id, "semantic-validation");
    assert.equal(semanticCheck.passed, false);
    assert.ok(semanticCheck.reason);
    assert.ok(trace.checks.slice(0, -1).every((check) => check.passed));
    assert.equal(trace.firstFailure.id, "semantic-validation");
    assert.equal(trace.firstFailure.reason, semanticCheck.reason);
    assert.ok(record.quarantineReasons.some((reason) => semanticCheck.reason.includes(reason)));
  };
  const incompatibleUnit = containResearchResult({
    evidence: [{ ...claim, unit: "MW" }],
  }).evidence[0];
  assertSemanticRejectionTrace(incompatibleUnit);
  const incompatibleAudit = buildResearchAudit({
    project: { name: "Northstar Campus", location: "Texas" },
    evidence: [incompatibleUnit],
    sources: [source],
  });
  const incompatibleReview = incompatibleAudit.eligibilityReview.claims[0];
  assert.ok(incompatibleReview.gates.some((gate) => gate.id === "semantic-validation" && !gate.passed));
  assert.equal(incompatibleReview.firstFailedGate, "semantic-validation");

  const invalidValue = containResearchResult({
    evidence: [{ ...claim, value: "not-a-number", numericValue: "not-a-number" }],
  }).evidence[0];
  assertSemanticRejectionTrace(invalidValue);

  const missingValueClaim = { ...claim };
  delete missingValueClaim.value;
  delete missingValueClaim.numericValue;
  delete missingValueClaim.rawValue;
  const missingValue = containResearchResult({ evidence: [missingValueClaim] }).evidence[0];
  assertSemanticRejectionTrace(missingValue);

  const rejectedPolicyInput = { ...policyInput, claimMappings: [] };
  const rejectedDecision = evaluateResearchEvidenceEligibility(rejectedPolicyInput);
  const tracedRejectedDecision = evaluateResearchEvidenceEligibility(rejectedPolicyInput, { includeCheckTrace: true });
  const { checkTrace: _rejectedTrace, ...rejectedOutcome } = tracedRejectedDecision;
  assert.deepEqual(rejectedOutcome, rejectedDecision);
  assert.equal(tracedRejectedDecision.eligible, false);
  assert.equal(tracedRejectedDecision.checkTrace.firstFailure.id, "claim-to-passage-mapping");
  const rejectedEvidence = containResearchResult({
    evidence: [{ ...claim, claimMappings: [] }],
  }).evidence;
  const rejectedAudit = buildResearchAudit({
    project: { name: "Northstar Campus", location: "Texas" },
    evidence: rejectedEvidence,
    sources: [source],
  });
  const rejectedReview = rejectedAudit.eligibilityReview.claims[0];
  assert.equal(rejectedEvidence[0].eligibleForModel, false);
  assert.equal(rejectedReview.firstFailedGate, tracedRejectedDecision.checkTrace.firstFailure.id);
  assert.deepEqual(rejectedReview.firstFailure, tracedRejectedDecision.checkTrace.firstFailure);
});

test("research audits retain policy checks, provider retries, redirects, and fetch metrics", () => {
  const url = "https://records.example.gov/grid/permit";
  const passage = "The project requested an 80 MW grid connection in 2025.";
  const source = {
    url,
    canonicalUrl: url,
    originalUrl: url,
    categoryIds: ["grid"],
    sourceChannel: "public-records",
    accessOutcome: {
      state: "accessible",
      reason: "retrieved",
      passage,
      redirectHops: [{
        status: 302,
        elapsedMs: 4,
        dnsValidation: { answerCount: 2, addressFamilyCounts: { ipv4: 1, ipv6: 1, other: 0 }, rejectingRules: [] },
      }],
      fetchMetrics: {
        elapsedMs: 17,
        responseStatus: 200,
        contentType: "text/html",
        bytesRead: 93,
        dnsValidation: { answerCount: 2, addressFamilyCounts: { ipv4: 1, ipv6: 1, other: 0 }, rejectingRules: [] },
      },
    },
  };
  const audit = buildResearchAudit({
    project: { name: "Northstar Compute", location: "Texas" },
    coverage: {
      deadlineAt: "2026-09-28T12:01:15.000Z",
      providerRequestCount: 1,
      providerAttempts: [{
        provider: "openai",
        model: "gpt-4o",
        requestState: "failed",
        issuedAt: "2026-09-28T12:00:01.000Z",
        finishedAt: "2026-09-28T12:00:02.000Z",
        elapsedMs: 1_000,
        status: 429,
        retryAfter: "1s",
        retryCount: 1,
        inFlightAnalysisCountAtIssue: 1,
        providerDiagnostic: { status: 429, errorType: "rate_limit_exceeded" },
      }],
      sourceAttemptRecords: [
        { ...source, discoveryCandidateRank: 3 },
        {
          url: "https://records.example.gov/grid/second-permit",
          discoveryCandidateRank: 4,
          accessOutcome: { state: "not-attempted", reason: "physical-open-budget" },
        },
        {
          url: "https://records.example.gov/grid/verification",
          discoveryCandidateRank: 5,
          accessOutcome: { state: "blocked-or-shell", reason: "bot-verification-page" },
        },
        {
          url: "https://records.example.gov/grid/thin",
          discoveryCandidateRank: 6,
          accessOutcome: { state: "low-content", reason: "genuine-prose-below-300-characters" },
        },
        {
          url: "https://records.example.gov/grid/repeated",
          discoveryCandidateRank: 7,
          accessOutcome: { state: "site-boilerplate", reason: "near-identical-article-already-retained-on-site" },
        },
      ],
    },
    sources: [source],
    evidence: [{
      id: "electricity_cost",
      sourceUrl: url,
      claimPassage: passage,
      facilityScope: "unknown",
      phaseScope: "unknown",
      claimTimePeriod: null,
      eligibleForModel: false,
      quarantineReasons: ["Exact facility phase is unresolved."],
      sourceValidation: {
        eligibilityTrace: {
          checks: [{
            id: "phase-scope",
            passed: false,
            reason: "Exact facility phase is unresolved.",
          }],
          firstFailure: {
            id: "phase-scope",
            reason: "Exact facility phase is unresolved.",
          },
        },
      },
    }],
    startedAt: "2026-09-28T12:00:00.000Z",
    finishedAt: "2026-09-28T12:00:05.000Z",
    runCorrelationId: "d760a1d5-00d8-4b65-a561-0d214f947070",
  });

  assert.equal(audit.deadlineAt, "2026-09-28T12:01:15.000Z");
  assert.equal(audit.providerRequestBudget.attempts[0].status, 429);
  assert.equal(audit.providerRequestBudget.attempts[0].retryAfter, "1s");
  assert.equal(audit.providerRequestBudget.attempts[0].retryCount, 1);
  const sourceAttempt = audit.sourceAttempts.find((attempt) => attempt.discoveryRank === 3);
  assert.equal(sourceAttempt.state, "accessible");
  assert.equal(sourceAttempt.reason, "retrieved");
  assert.equal(sourceAttempt.fetchMetrics.responseStatus, 200);
  assert.equal(sourceAttempt.fetchMetrics.bytesRead, 93);
  assert.equal(sourceAttempt.redirectHops[0].status, 302);
  assert.equal(sourceAttempt.redirectHops[0].dnsValidation.addressFamilyCounts.ipv6, 1);
  const skippedAttempt = audit.sourceAttempts.find((attempt) => attempt.discoveryRank === 4);
  assert.equal(skippedAttempt.state, "not-attempted");
  assert.ok(audit.eligibilityReview.claims[0].gates.some((gate) => gate.passed === false));
  assert.equal(skippedAttempt.reason, "physical-open-budget");
  for (const [rank, state, reason] of [
    [5, "blocked-or-shell", "bot-verification-page"],
    [6, "low-content", "genuine-prose-below-300-characters"],
    [7, "site-boilerplate", "near-identical-article-already-retained-on-site"],
  ]) {
    const attempt = audit.sourceAttempts.find((item) => item.discoveryRank === rank);
    assert.equal(attempt.state, state);
    assert.equal(attempt.reason, reason);
  }
  const review = audit.eligibilityReview.claims[0];
  assert.equal(review.sourcePassage, passage);
  assert.equal(review.sourcePassageHash, createHash("sha256").update(passage).digest("hex"));
  assert.deepEqual(review.gates, [{
    id: "phase-scope",
    passed: false,
    reason: "Exact facility phase is unresolved.",
  }]);
  assert.deepEqual(review.firstFailure, {
    id: "phase-scope",
    reason: "Exact facility phase is unresolved.",
  });
  assert.equal(review.firstFailedGate, "phase-scope");
});

test("research refuses provider work when the audit start insert fails", async () => {
  const response = responseRecorder();
  let providerCalls = 0;
  await handleResearchProjectRequest(request({
    name: "Audit Gate Fixture",
    location: "Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "offline-fixture-key",
    googleApiKey: null,
    googleDiscoveryImpl: async () => {
      providerCalls += 1;
      throw new Error("The provider must not be called.");
    },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error("Network access must not be attempted.");
    },
    cache: createResearchProjectCache(),
    auditRepository: {
      async startRun() { throw new Error("offline audit storage failure"); },
      async finishRun() { throw new Error("No started row should be finished."); },
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().errorType, "audit-storage");
  assert.match(response.json().error, /No research provider request was issued/);
  assert.equal(providerCalls, 0);
});

test("research audit finalization retries finishRun once after transient failure", async () => {
  let finishCalls = 0;
  let markFinished;
  const finished = new Promise((resolve) => { markFinished = resolve; });
  await completeOfflineAuditResponse({
    async startRun() {},
    async finishRun(record) {
      finishCalls += 1;
      if (finishCalls === 1) throw new Error("transient completion failure");
      markFinished(record);
    },
  });
  const saved = await finished;
  assert.equal(finishCalls, 2);
  assert.notEqual(saved.researchStatus, "finalization-failed");
  assert.notEqual(saved.audit.lifecycleState, "finalization-failed");
});

test("research audit marks finalization-failed after both finish attempts fail", async () => {
  let finishCalls = 0;
  let markCalls = 0;
  let markFailed;
  const marked = new Promise((resolve) => { markFailed = resolve; });
  await completeOfflineAuditResponse({
    async startRun() {},
    async finishRun() {
      finishCalls += 1;
      throw new Error("audit storage is unavailable");
    },
    async markFinalizationFailed(record) {
      markCalls += 1;
      markFailed(record);
    },
  });
  const saved = await marked;
  assert.equal(finishCalls, 2);
  assert.equal(markCalls, 1);
  assert.equal(saved.researchStatus, "finalization-failed");
  assert.equal(saved.audit.lifecycleState, "finalization-failed");
});

test("research audit logs run ID and failure state when marker persistence also fails", async () => {
  let startedRecord;
  let logged;
  let markLogged;
  const logReceived = new Promise((resolve) => { markLogged = resolve; });
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const serialized = args.find((argument) => typeof argument === "string" && argument.startsWith("{"));
    if (!serialized) return;
    const entry = JSON.parse(serialized);
    if (entry.event !== "research_audit_finalization_failed") return;
    logged = entry;
    markLogged();
  };
  try {
    await completeOfflineAuditResponse({
      async startRun(record) { startedRecord = record; },
      async finishRun() { throw new Error("audit storage is unavailable"); },
      async markFinalizationFailed() { throw new Error("audit storage is unavailable"); },
    });
    await logReceived;
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(logged.runId, startedRecord.runId);
  assert.equal(logged.failureState, "finalization-failed");
  assert.equal(logged.level, "error");
  assert.equal(logged.event, "research_audit_finalization_failed");
});

test("research audit finalization waits for the response finish event", async () => {
  const response = Object.assign(new EventEmitter(), responseRecorder());
  response.writableEnded = false;
  response.writableFinished = false;
  let markEnded;
  const ended = new Promise((resolve) => { markEnded = resolve; });
  response.end = function end(body) {
    this.body = body ?? "";
    this.writableEnded = true;
    markEnded();
  };
  let startedRecord;
  let finishedRecord;
  let markFinished;
  const finished = new Promise((resolve) => { markFinished = resolve; });
  const pending = handleResearchProjectRequest(request({
    name: "Audit Lifecycle Fixture",
    location: "Texas",
    forceRefresh: true,
  }), response, {
    apiKey: null,
    googleApiKey: null,
    fetchImpl: async () => { throw new Error("No provider request is expected."); },
    cache: createResearchProjectCache(),
    auditRepository: {
      async startRun(record) { startedRecord = record; },
      async finishRun(record) {
        assert.equal(response.writableFinished, true);
        finishedRecord = record;
        markFinished(record);
      },
    },
  });

  await ended;
  assert.ok(startedRecord);
  assert.equal(startedRecord.researchStatus, "running");
  assert.equal(response.headers["x-safeloc-research-run-id"], startedRecord.runId);
  assert.equal(response.json().runId, undefined);
  assert.ok(startedRecord.audit.deadlineAt);
  assert.ok(startedRecord.audit.runtime.buildId);
  assert.ok(startedRecord.audit.promptVersions.projectResearch);
  assert.equal(finishedRecord, undefined);
  response.writableFinished = true;
  response.emit("finish");
  await pending;
  const saved = await finished;
  assert.equal(saved.runId, startedRecord.runId);
  assert.equal(saved.startedAt, startedRecord.startedAt);
  assert.equal(saved.audit.responseStartedAt !== null, true);
  assert.equal(saved.audit.responseFinishedAt !== null, true);
});

test("research responses without a persisted run do not invent a run-ID header", async () => {
  const cache = createResearchProjectCache();
  const cacheResponse = responseRecorder();
  await handleResearchProjectRequest({
    method: "GET",
    url: `/api/research-project?cacheKey=${"a".repeat(64)}`,
  }, cacheResponse, { cache });
  assert.equal(cacheResponse.statusCode, 200);
  assert.equal(cacheResponse.headers["x-safeloc-research-run-id"], undefined);

  const methodResponse = responseRecorder();
  await handleResearchProjectRequest(request({}, "PATCH"), methodResponse, { cache });
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers["x-safeloc-research-run-id"], undefined);
  assert.deepEqual(methodResponse.json(), { error: "Method not allowed" });
});

test("a client disconnect is captured and cancels an in-flight offline provider fixture", async () => {
  const req = Object.assign(new EventEmitter(), request({
    name: "Audit Disconnect Fixture",
    location: "Texas",
    forceRefresh: true,
  }));
  const response = Object.assign(new EventEmitter(), responseRecorder());
  response.writableFinished = false;
  response.destroyed = false;
  let markProviderStarted;
  const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
  let finishedRecord;
  let markFinished;
  const finished = new Promise((resolve) => { markFinished = resolve; });
  const pending = handleResearchProjectRequest(req, response, {
    apiKey: "offline-fixture-key",
    googleApiKey: null,
    googleDiscoveryImpl: async ({ signal }) => {
      markProviderStarted();
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("offline fixture aborted")), { once: true });
      });
    },
    fetchImpl: async () => { throw new Error("No network request is expected."); },
    cache: createResearchProjectCache(),
    auditRepository: {
      async startRun() {},
      async finishRun(record) {
        finishedRecord = record;
        markFinished(record);
      },
    },
  });

  await providerStarted;
  response.destroyed = true;
  response.emit("close");
  await pending;
  const saved = await finished;
  assert.equal(saved.researchStatus, "cancelled");
  assert.equal(saved.audit.browserDisconnectedBeforeFinish, true);
  assert.ok(saved.audit.clientDisconnectedAt);
  assert.equal(saved.audit.responseStartedAt, null);
  assert.equal(finishedRecord.runId, saved.runId);
});

test("request-local canary overrides expose the eight-open and three-provider limits without changing defaults", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-canary-budget-test-"));
  let discoveryRequests = 0;
  let providerRequests = 0;
  try {
    const req = request({
      name: "Red Oak Campus",
      location: "Red Oak, Ellis County, Texas",
      forceRefresh: true,
    });
    req.headers = { "x-safeloc-research-policy": "single-shot" };
    const response = responseRecorder();
    await handleResearchProjectRequest(req, response, {
      apiKey: "offline-openai-key",
      googleApiKey: "offline-google-key",
      googleDiscoveryImpl: async () => {
        discoveryRequests += 1;
        return {
          status: "completed",
          provider: "google-gemini-grounding",
          model: "offline-fixture",
          queries: ["Red Oak Campus DataBank"],
          candidates: [],
          groundingMetadataPresent: true,
          groundingSearchExecuted: true,
          usableCitationMetadataPresent: false,
          providerRequestCount: 1,
          providerAttempt: {
            provider: "google-gemini-grounding",
            model: "offline-fixture",
            requestCount: 1,
            requestState: "issued",
            outcome: "completed",
          },
        };
      },
      fetchImpl: async () => {
        providerRequests += 1;
        throw new Error("Offline budget test must not issue a structured request.");
      },
      cache: createResearchProjectCache({ directory }),
      registry: { async retain() {} },
      rateLimiter: createResearchProjectRateLimiter(),
      categoryIds: ["project-identity", "grid"],
      allowGoogleFallback: false,
      allowCorrectiveRetries: false,
      allowProviderRetries: false,
      useDefaultSecConnector: false,
      researchBudgetOverrides: {
        maxProviderRequests: 3,
        maxPhysicalDocumentOpens: 8,
        maxFollowUps: 0,
        maxFollowUpsPerCategory: 0,
        maxCandidatesPerCategory: 8,
        maxTotalCandidates: 16,
      },
    });
    const payload = response.json();
    assert.equal(discoveryRequests, 1);
    assert.equal(providerRequests, 0);
    assert.equal(payload.researchAudit.budget.maxProviderRequests, 3);
    assert.equal(payload.researchAudit.budget.maxPhysicalDocumentOpens, 8);
    assert.equal(payload.researchAudit.physicalOpenBudget, 8);
    assert.equal(payload.researchAudit.followUpLimit, 0);
    assert.equal(payload.researchAudit.followUpLimitPerCategory, 0);
    assert.equal(payload.researchAudit.providerRequestBudget.maximum, 3);
    assert.equal(RESEARCH_RUN_BUDGET.maxProviderRequests, 16);
    assert.equal(RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens, 24);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("two-category canary budget cannot issue extra structured calls, follow-ups, or document opens", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/research-partial-receipts.json", import.meta.url),
    "utf8",
  ));
  const passage = "Project Atlas in Phoenix, Arizona has a documented grid interconnection request with a public milestone schedule.";
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    ...retrievedSource,
    url: `https://records.example.test/atlas/canary-${index + 1}`,
    title: `Synthetic Project Atlas grid record ${index + 1}`,
    excerpt: passage,
    claimPassage: passage,
    categoryIds: [index % 2 === 0 ? "project-identity" : "grid"],
    searchDomain: index % 2 === 0 ? "project-identity" : "grid",
    sourceChannel: "google-grounded-search",
  }));
  let discoveryCalls = 0;
  let structuredCalls = 0;
  const diagnosticCapture = { candidates: null, receipts: [], authorizations: [] };
  const structuredCategories = [];
  const trace = createRedOakClaimTrace();
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "offline-openai-key",
    googleApiKey: "offline-google-key",
    req: request({}),
    categoryIds: ["project-identity", "grid"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: {
      maxProviderRequests: 3,
      maxPhysicalDocumentOpens: 8,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 8,
      maxTotalCandidates: 16,
    },
    researchTimeoutMs: 8_000,
    analysisReserveMs: 0,
    documentTimeoutMs: 1_000,
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryPrompt: "Offline canary discovery prompt",
    canaryDiagnosticCollector: {
      recordDiscoveryCandidates(value) {
        diagnosticCapture.candidates = value;
      },
      recordPhysicalOpenAuthorization(value) {
        diagnosticCapture.authorizations.push(value);
      },
      recordPhysicalReceipt(value) {
        diagnosticCapture.receipts.push(value);
      },
    },
    googleDiscoveryImpl: async ({ prompt }) => {
      discoveryCalls += 1;
      assert.equal(prompt, "Offline canary discovery prompt");
      const discovery = await completedGoogleDiscovery(candidates)();
      return {
        ...discovery,
        providerAttempt: {
          provider: "google-gemini-grounding",
          model: "offline-fixture",
          requestCount: 1,
          requestState: "issued",
          outcome: "completed",
        },
      };
    },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => substantiveHtmlResponse(passage, url),
    fetchImpl: async (_url, init) => {
      structuredCalls += 1;
      const requestBody = JSON.parse(init.body);
      const categoryId = requestBody.text.format.name === "safeloc_project_identity"
        ? "project-identity"
        : "grid";
      structuredCategories.push(categoryId);
      const base = validResearchResponse();
      const research = categoryId === "project-identity"
        ? {
          projectSummary: {
            ...base.projectSummary,
            name: fixture.project.name,
            location: fixture.project.location,
          },
          identityAssessment: {
            exactProjectIdentityEstablished: true,
            matchedName: fixture.project.name,
            matchedLocation: fixture.project.location,
            matchedOperator: "Project Atlas",
            reason: "The synthetic public record establishes the exact project.",
          },
        }
        : {
          ...base,
          projectSummary: {
            ...base.projectSummary,
            name: fixture.project.name,
            location: fixture.project.location,
          },
          evidence: base.evidence
            .filter((item) => buildResearchCategoryPlan(fixture.project).categories
              .find((category) => category.categoryId === "grid").evidenceIds.includes(item.id))
            .map((item) => ({
              ...item,
              sourceUrl: candidates.find((candidate) => candidate.categoryIds.includes("grid")).url,
              sourceUrls: [candidates.find((candidate) => candidate.categoryIds.includes("grid")).url],
              claimPassage: passage,
              description: "The synthetic record reports a project-specific grid milestone.",
              classification: "Management Assertion",
              coverageStatus: "supported",
            })),
        };
      return new Response(JSON.stringify({
        id: `resp_offline_${categoryId}`,
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(research) }],
        }],
      }), { status: 200 });
    },
    claimTrace: trace,
  });

  assert.equal(discoveryCalls, 1);
  assert.equal(diagnosticCapture.candidates.length, candidates.length);
  assert.equal(diagnosticCapture.receipts.length >= candidates.length, true);
  assert.equal(diagnosticCapture.authorizations.length, 8);
  assert.equal(diagnosticCapture.receipts.some((receipt) => receipt.attempted === false), true);
  assert.equal(diagnosticCapture.receipts.some((receipt) => receipt.attempted === true), true);
  assert.equal(diagnosticCapture.candidates[0].url, candidates[0].url);
  assert.equal(structuredCalls, 2);
  assert.deepEqual(structuredCategories.sort(), ["grid", "project-identity"]);
  assert.equal(result.researchAudit.physicalOpensUsed, 8);
  assert.equal(result.researchAudit.budget.maxPhysicalDocumentOpens, 8);
  assert.equal(result.researchAudit.budget.maxProviderRequests, 3);
  assert.equal(result.researchAudit.followUpLimit, 0);
  assert.equal(result.researchAudit.followUpLimitPerCategory, 0);
  assert.equal(result.researchAudit.providerRequestCount <= 3, true);
  const traceResult = trace.toJSON();
  assert.equal(traceResult.analysisPassages.length, 1);
  const responseByCategory = new Map(traceResult.responses.map((response) => [response.categoryId, response]));
  assert.equal(responseByCategory.get("project-identity").state, "no-claims");
  assert.equal(responseByCategory.get("project-identity").claimCount, 0);
  assert.equal(responseByCategory.get("grid").state, "claims-received");
  assert.equal(responseByCategory.get("grid").claimCount, 4);
  const gridPacket = traceResult.analysisPassages[0];
  assert.equal(gridPacket.providerResponseId, "resp_offline_grid");
  assert.equal(gridPacket.state, "issued-to-provider");
  assert.equal(gridPacket.passageCount, gridPacket.passages.length);
  assert.ok(gridPacket.packetSha256);
  assert.ok(gridPacket.passages.length > 0);
  assert.ok(gridPacket.passages[0].passageId.startsWith("passage-"));
  assert.ok(gridPacket.passages[0].quoteSha256);
  assert.ok(gridPacket.passages[0].excerpt);
});

test("retrieval-only admission ranks exact-project sources before a competing cap and preserves every candidate", async () => {
  const project = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    knownData: {
      aliases: ["Red Oak Campus", "DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
      operator: "DataBank",
      companyDomains: ["databank.com"],
      facilityIdentifiers: ["DFW9", "DFW10", "DFW11"],
      city: "Red Oak",
      county: "Ellis County",
      state: "Texas",
    },
  };
  const candidates = [
    {
      url: "https://databank.com/",
      title: "DataBank",
      categoryIds: ["project-identity"],
    },
    {
      url: "https://databank.com/sitemap.xml",
      title: "DataBank sitemap",
      categoryIds: ["project-identity"],
    },
    {
      url: "https://elliscounty.gov/data-center-policy",
      title: "Ellis County Data Center Policy",
      categoryIds: ["grid"],
    },
    {
      url: "https://youtube.com/watch?v=red-oak",
      title: "Red Oak Campus grid interconnection video",
      categoryIds: ["grid"],
      sourceType: "video",
    },
    {
      url: "https://reporting.example/red-oak-campus-grid",
      title: "Red Oak Campus grid interconnection report",
      categoryIds: ["grid"],
    },
    {
      url: "https://databank.com/projects/red-oak-campus-dfw11",
      title: "DataBank Red Oak Campus DFW11 project record",
      categoryIds: ["grid"],
    },
    {
      url: "https://tdlr.texas.gov/TABS/Search/Project/DFW11",
      title: "TDLR filing for DataBank Red Oak Campus DFW11",
      categoryIds: ["project-identity"],
    },
  ].map((candidate) => ({
    ...candidate,
    searchDomain: candidate.categoryIds[0],
    sourceChannel: "google-grounded-search",
  }));
  const openedUrls = [];
  const discoveryAudit = { candidates: [], receipts: [], authorizations: [] };
  let discoveryCalls = 0;
  let structuredCalls = 0;
  const result = await runValidatedResearch(project, {
    apiKey: "offline-openai-key",
    googleApiKey: "offline-google-key",
    req: request({}),
    categoryIds: ["project-identity", "grid"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    retrievalOnly: true,
    researchBudgetOverrides: {
      maxProviderRequests: 3,
      maxPhysicalDocumentOpens: 2,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 8,
      maxTotalCandidates: 5,
    },
    researchTimeoutMs: 8_000,
    analysisReserveMs: 0,
    documentTimeoutMs: 1_000,
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    canaryDiagnosticCollector: {
      recordDiscoveryCandidates(value) {
        discoveryAudit.candidates = value;
      },
      recordPhysicalOpenAuthorization(value) {
        discoveryAudit.authorizations.push(value);
      },
      recordPhysicalReceipt(value) {
        discoveryAudit.receipts.push(value);
      },
    },
    googleDiscoveryImpl: async () => {
      discoveryCalls += 1;
      return completedGoogleDiscovery(candidates)();
    },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => {
      openedUrls.push(String(url));
      if (String(url) === candidates[6].url) {
        return new Response("forbidden", { status: 403, headers: { "content-type": "text/plain" } });
      }
      return substantiveHtmlResponse(
        "DataBank Red Oak Campus is named in this synthetic public page. No real project metric is represented here.",
        url,
      );
    },
    fetchImpl: async () => {
      structuredCalls += 1;
      throw new Error("Retrieval-only acceptance must stop before structured provider work.");
    },
  });

  assert.equal(discoveryCalls, 1);
  assert.equal(structuredCalls, 0);
  assert.deepEqual(openedUrls, [candidates[6].url, candidates[5].url]);
  assert.equal(result.researchAudit.physicalOpensUsed, 2);
  assert.equal(result.researchAudit.retrievalOnlyStop, "discovery-prefetch-complete");
  assert.equal(result.cacheable, false);
  assert.ok(result.evidence.every((item) => item.eligibleForModel !== true));

  const admitted = result.researchCoverage.discoveryCandidates;
  assert.equal(admitted.length, candidates.length);
  assert.deepEqual(admitted.map((candidate) => candidate.discoveryRank), [7, 6, 5, 4, 3, 1, 2]);
  assert.deepEqual(admitted.slice(0, 2).map((candidate) => candidate.physicalOpenAdmission), [
    "authorized",
    "authorized",
  ]);
  assert.deepEqual(admitted.slice(0, 2).map((candidate) => candidate.accessState), [
    "blocked",
    "accessible",
  ]);
  assert.equal(admitted[2].accessReason, "physical-open-budget");
  assert.equal(admitted.at(-1).selectionReason, "candidate-limit");
  assert.equal(admitted.at(-1).selectedForOpen, false);
  assert.equal(discoveryAudit.candidates.length, candidates.length);
  assert.equal(discoveryAudit.authorizations.length, 2);
  assert.equal(discoveryAudit.receipts.length, candidates.length);
});

test("retrievalOnly request body runs without OpenAI credentials, stops before official continuation, and finalizes audit", async () => {
  const body = {
    name: "Red Oak Campus",
    location: "Red Oak, Ellis County, Texas",
    retrievalOnly: true,
    knownData: {
      aliases: ["Red Oak Campus", "DataBank Red Oak Campus"],
      operator: "DataBank",
      companyDomains: ["databank.com"],
      knownOfficialEndpoints: ["https://databank.com/projects/red-oak-campus"],
    },
  };
  const candidate = {
    url: "https://tdlr.texas.gov/TABS/Search/Project/DFW11",
    title: "TDLR filing for DataBank Red Oak Campus DFW11",
    categoryIds: ["project-identity"],
    searchDomain: "project-identity",
    sourceChannel: "google-grounded-search",
  };
  const response = Object.assign(new EventEmitter(), responseRecorder());
  response.writableEnded = false;
  response.writableFinished = false;
  let markResponseEnded;
  const responseEnded = new Promise((resolve) => { markResponseEnded = resolve; });
  response.end = function end(serialized) {
    this.body = serialized ?? "";
    this.writableEnded = true;
    markResponseEnded();
  };
  let markAuditFinished;
  const auditFinished = new Promise((resolve) => { markAuditFinished = resolve; });
  let startedAudit = null;
  let finishedAudit = null;
  const auditRepository = {
    async startRun(record) {
      startedAudit = record;
    },
    async finishRun(record) {
      finishedAudit = record;
      markAuditFinished(record);
    },
  };
  let discoveryCalls = 0;
  let structuredCalls = 0;
  const documentFetches = [];
  const pending = handleResearchProjectRequest(request(body), response, {
    apiKey: null,
    googleApiKey: null,
    googleDiscoveryImpl: async () => {
      discoveryCalls += 1;
      return completedGoogleDiscovery([candidate])();
    },
    fetchImpl: async () => {
      structuredCalls += 1;
      throw new Error("No structured provider request is expected.");
    },
    documentFetchImpl: async (url) => {
      documentFetches.push(String(url));
      return new Response("forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    cache: createResearchProjectCache(),
    registry: { async retain() {} },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    auditRepository,
    categoryIds: ["project-identity"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: { maxPhysicalDocumentOpens: 4 },
  });

  await responseEnded;
  await pending;
  response.writableFinished = true;
  response.emit("finish");
  const completedAudit = await auditFinished;
  const payload = response.json();

  assert.equal(discoveryCalls, 1);
  assert.equal(structuredCalls, 0);
  assert.deepEqual(documentFetches, [
    body.knownData.knownOfficialEndpoints[0],
    candidate.url,
  ], "the supplied endpoint and discovery candidate are prefetched once; no continuation runs afterward");
  assert.equal(startedAudit.researchStatus, "running");
  assert.ok(completedAudit.finishedAt);
  assert.equal(completedAudit.audit.retrievalOnlyStop, "discovery-prefetch-complete");
  assert.equal(completedAudit.audit.physicalOpensUsed, 2);
  assert.equal(payload.researchAudit.retrievalOnlyStop, "discovery-prefetch-complete");
  assert.equal(payload.researchCoverage.discoveryCandidates.length, 2);
  assert.equal(payload.researchCoverage.discoveryCandidates[0].selectedForOpen, true);
  assert.equal(payload.researchCoverage.discoveryCandidates[0].accessState, "blocked");
  assert.equal(payload.researchAudit.sourceAttempts.length, 2);
  assert.equal(payload.researchAudit.sourceAttempts[0].acquisitionSelected, true);
});

test("production research audit retains original Google citation ranks and canonical duplicate decisions", async () => {
  const duplicateAnnotations = [
    { type: "url_citation", url: "https://records.example.test/atlas/one?id=1", title: "Project Atlas filing one" },
    { type: "url_citation", url: "https://records.example.test/atlas/one?id=1&utm_source=duplicate", title: "Duplicate one" },
    { type: "url_citation", url: "https://records.example.test/atlas/three?id=3", title: "Project Atlas filing three" },
    { type: "url_citation", url: "https://records.example.test/atlas/three?id=3&utm_medium=duplicate", title: "Duplicate three" },
    { type: "url_citation", url: "javascript:alert(1)", title: "Unsafe citation" },
    { type: "url_citation", title: "Missing URL citation" },
    { type: "url_citation", url: "https://records.example.test/atlas/seven?id=7", title: "Project Atlas filing seven" },
    { type: "url_citation", url: "https://records.example.test/atlas/seven?id=7&utm_source=duplicate", title: "Duplicate seven" },
    { type: "url_citation", url: "https://records.example.test/atlas/one?id=1&utm_campaign=repeat", title: "Repeated filing one" },
    { type: "url_citation", url: "ftp://127.0.0.1/private", title: "Non-HTTP citation" },
    { type: "url_citation", url: "https://records.example.test/atlas/three?id=3&utm_campaign=repeat", title: "Repeated filing three" },
    { type: "url_citation", url: "https://records.example.test/atlas/seven?id=7&utm_campaign=repeat", title: "Repeated filing seven" },
    { type: "url_citation", url: "https://records.example.test/atlas/thirteen?id=13", title: "Project Atlas filing thirteen" },
  ];
  const discovery = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["Project Atlas Taylor County filings"] } },
      { type: "google_search_result", result: {} },
      { type: "model_output", content: [{
        type: "text",
        text: "Grounded citation fixture.",
        annotations: duplicateAnnotations,
      }] },
    ],
  });
  const documentCalls = [];
  let structuredCalls = 0;
  const result = await runValidatedResearch({
    name: "Project Atlas",
    location: "Taylor County, Texas",
  }, {
    apiKey: null,
    googleApiKey: null,
    googleDiscoveryImpl: async () => discovery,
    categoryIds: ["project-identity"],
    retrievalOnly: true,
    req: request({}),
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: { maxPhysicalDocumentOpens: 2 },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => {
      documentCalls.push(String(url));
      return new Response("forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    },
    fetchImpl: async () => {
      structuredCalls += 1;
      throw new Error("Retrieval-only audit regression must not call a structured provider.");
    },
  });

  const audit = result.researchAudit.discovery;
  assert.equal(structuredCalls, 0);
  assert.equal(documentCalls.length, 2);
  assert.equal(audit.annotationCount, duplicateAnnotations.length);
  assert.equal(audit.candidateCount, 4);
  assert.deepEqual(
    audit.rawAnnotationSummaries.filter((item) => item.accepted).map((item) => item.discoveryRank),
    [1, 3, 7, 13],
  );
  assert.deepEqual(
    audit.rawAnnotationSummaries.filter((item) => item.rejectionReason === "duplicate-canonical-url")
      .map((item) => item.discoveryRank),
    [2, 4, 8, 9, 11, 12],
  );
  assert.equal(audit.rawAnnotationSummaries[0].url, "https://records.example.test/atlas/one");
  assert.equal(audit.rawAnnotationSummaries[1].canonicalUrl, audit.rawAnnotationSummaries[0].canonicalUrl);
  assert.equal(audit.rawAnnotationSummaries[4].url, null, "unsafe raw annotation URLs are not exposed");
  assert.equal(audit.rawAnnotationSummaries[5].rejectionReason, "missing-url");
  assert.equal(audit.rawAnnotationSummaries[9].url, null, "non-HTTP URLs are not exposed");
  assert.deepEqual(
    audit.rejectedCitationUrls.map((item) => item.discoveryRank),
    [2, 4, 5, 6, 8, 9, 10, 11, 12],
  );
  assert.doesNotMatch(JSON.stringify(audit), /utm_|javascript:|127\.0\.0\.1/);
});

test("finalized request audit retains all discovery ranks and every admitted physical-open receipt", async () => {
  const candidates = Array.from({ length: 80 }, (_, index) => ({
    url: `https://records.example.test/project-atlas/item-${index + 1}`,
    title: `Project Atlas public record ${index + 1}`,
    categoryIds: ["project-identity"],
    searchDomain: "project-identity",
    sourceChannel: "google-grounded-search",
  }));
  const body = {
    name: "Project Atlas",
    location: "Taylor County, Texas",
    retrievalOnly: true,
    forceRefresh: true,
  };
  const response = Object.assign(new EventEmitter(), responseRecorder());
  response.writableEnded = false;
  response.writableFinished = false;
  let markResponseEnded;
  const responseEnded = new Promise((resolve) => { markResponseEnded = resolve; });
  response.end = function end(serialized) {
    this.body = serialized ?? "";
    this.writableEnded = true;
    markResponseEnded();
  };
  let markAuditFinished;
  const auditFinished = new Promise((resolve) => { markAuditFinished = resolve; });
  let finishedAudit = null;
  const auditRepository = {
    async startRun() {},
    async finishRun(record) {
      finishedAudit = record;
      markAuditFinished(record);
    },
  };
  const documentCalls = [];
  let structuredCalls = 0;

  const pending = handleResearchProjectRequest(request(body), response, {
    apiKey: null,
    googleApiKey: null,
    googleDiscoveryImpl: completedGoogleDiscovery(candidates),
    cache: createResearchProjectCache(),
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    auditRepository,
    categoryIds: ["project-identity"],
    researchBudgetOverrides: {
      maxTotalCandidates: 16,
      maxCandidatesPerCategory: 16,
      maxPhysicalDocumentOpens: 8,
    },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => {
      documentCalls.push(String(url));
      return new Response("forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    },
    fetchImpl: async () => {
      structuredCalls += 1;
      throw new Error("Retrieval-only audit regression must not call a structured provider.");
    },
  });

  await responseEnded;
  await pending;
  response.writableFinished = true;
  response.emit("finish");
  const finalized = await auditFinished;
  const persistedAudit = finalized.audit;
  assert.equal(response.statusCode, 200);
  assert.equal(structuredCalls, 0);
  assert.equal(documentCalls.length, 8);
  assert.equal(persistedAudit.physicalOpensUsed, 8);
  assert.equal(persistedAudit.discoveryCandidates.length, 80);
  assert.deepEqual(
    persistedAudit.discoveryCandidates.map((candidate) => candidate.discoveryRank),
    Array.from({ length: 80 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    persistedAudit.sourceAttempts.map((attempt) => attempt.discoveryRank).sort((left, right) => left - right),
    Array.from({ length: 80 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    persistedAudit.sourceAttempts
      .map((attempt) => attempt.physicalOpenIndex)
      .filter(Number.isInteger)
      .sort((left, right) => left - right),
    Array.from({ length: 8 }, (_, index) => index + 1),
  );
  assert.equal(
    persistedAudit.discoveryCandidates.filter((candidate) => candidate.selectedForOpen).length,
    8,
  );
  assert.ok(persistedAudit.discoveryCandidates.every((candidate) =>
    candidate.physicalOpenAdmission && (candidate.accessState || candidate.accessReason)));
});

test("blocked discovery documents produce unavailable trace responses without fabricated structured claims", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/research-partial-receipts.json", import.meta.url),
    "utf8",
  ));
  const candidates = ["project-identity", "grid"].map((categoryId) => ({
    ...retrievedSource,
    url: `https://records.example.test/atlas/${categoryId}-blocked`,
    title: `Synthetic ${categoryId} search result`,
    excerpt: "Unopened search-result snippet; not a retrieved passage.",
    claimPassage: undefined,
    categoryIds: [categoryId],
    searchDomain: categoryId,
    sourceChannel: "google-grounded-search",
  }));
  const trace = createRedOakClaimTrace();
  let structuredCalls = 0;
  const result = await runValidatedResearch(fixture.project, {
    apiKey: "offline-openai-key",
    googleApiKey: "offline-google-key",
    req: request({}),
    categoryIds: ["project-identity", "grid"],
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: {
      maxProviderRequests: 3,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 8,
      maxTotalCandidates: 16,
      maxToolCalls: 32,
      maxPhysicalDocumentOpens: 8,
    },
    researchTimeoutMs: 8_000,
    analysisReserveMs: 0,
    documentTimeoutMs: 1_000,
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    googleDiscoveryImpl: completedGoogleDiscovery(candidates),
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async () => new Response("blocked", { status: 403 }),
    fetchImpl: async () => {
      structuredCalls += 1;
      throw new Error("No structured provider request is expected for blocked documents.");
    },
    claimTrace: trace,
  });

  const diagnostic = trace.toJSON();
  const responseByCategory = new Map(diagnostic.responses.map((response) => [response.categoryId, response]));
  assert.equal(result.researchAudit.physicalOpensUsed > 0, true);
  assert.equal(structuredCalls, 0);
  assert.equal(diagnostic.claims.length, 0);
  assert.equal(diagnostic.analysisPassages.length, 0);
  for (const categoryId of ["project-identity", "grid"]) {
    const response = responseByCategory.get(categoryId);
    assert.ok(response, `Expected an explicit unavailable trace state for ${categoryId}.`);
    assert.equal(response.state, "not-issued");
    assert.equal(response.claimCount, null);
    assert.equal(response.claimCountState, "unavailable");
    assert.equal(response.parseState, "not-evaluated");
    assert.deepEqual(response.omittedClaimIds, []);
  }
});

test("request-local abort signal cancels an in-flight discovery before structured work", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-canary-cancel-test-"));
  const controller = new AbortController();
  let capturedDiscoverySignal = null;
  let markDiscoveryStarted;
  const discoveryStarted = new Promise((resolve) => { markDiscoveryStarted = resolve; });
  let structuredCalls = 0;
  try {
    const response = responseRecorder();
    const pending = handleResearchProjectRequest(request({
      name: "Red Oak Campus",
      location: "Red Oak, Ellis County, Texas",
      forceRefresh: true,
    }), response, {
      apiKey: "offline-openai-key",
      googleApiKey: "offline-google-key",
      googleDiscoveryImpl: async ({ signal }) => {
        capturedDiscoverySignal = signal;
        markDiscoveryStarted();
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("offline discovery cancelled")), { once: true });
        });
      },
      fetchImpl: async () => {
        structuredCalls += 1;
        throw new Error("Structured analysis must not start after cancellation.");
      },
      cache: createResearchProjectCache({ directory }),
      registry: { async retain() {} },
      rateLimiter: createResearchProjectRateLimiter(),
      categoryIds: ["project-identity", "grid"],
      allowGoogleFallback: false,
      allowCorrectiveRetries: false,
      allowProviderRetries: false,
      useDefaultSecConnector: false,
      signal: controller.signal,
    });
    await discoveryStarted;
    controller.abort();
    await pending;
    assert.equal(capturedDiscoverySignal.aborted, true);
    assert.equal(structuredCalls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});