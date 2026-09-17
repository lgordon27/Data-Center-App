import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";

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
  handleResearchProjectRequest,
  parseResearchResponse,
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
  containResearchResult,
  buildResearchAudit,
  buildResearchCategoryPlan,
  buildProjectIdentityContext,
  mergeCategoryResearchResults,
  buildCategoryFollowUpQuery,
  evaluateResearchDocumentAccess,
  accessResearchDocument,
  createPinnedLookup,
  orchestrateCategoryResearch,
  runValidatedResearch,
  researchProjectWithWebSearch,
  classifyResearchFailure,
} from "./researchProjectProxy.mjs";
import {
  classifyResearchCacheAge,
  createResearchProjectCache,
  researchProjectCacheKey,
} from "./researchProjectCache.mjs";

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
      claimPassage: "A public source excerpt about Project Atlas reports 42 and 365 and behind-the-meter generation.",
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
  excerpt: "A public source excerpt about Project Atlas reports 42 and 365 and behind-the-meter generation.",
  claimPassage: "A public source excerpt about Project Atlas reports 42 and 365 and behind-the-meter generation.",
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

test("uses a 90-second server research budget", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 90_000);
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
  assert.equal(evaluateResearchDocumentAccess({ url: "https://example.gov/report.pdf", contentType: "application/pdf", accessStatus: "open", scanned: true }).reason, "scanned-pdf");
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
    fetchImpl: async () => new Response("<html><body><h1>Project Atlas</h1><p>Permit record.</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    now: () => "2026-09-08T12:00:00.000Z",
  });
  assert.equal(html.state, "accessible");
  assert.match(html.passage, /Project Atlas Permit record/);
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
  assert.equal(json.format, "text");
  assert.match(json.passage, /Project Atlas/);
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
  const gate = createResearchProviderGate({ limit: 2 });
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
  assert.equal(peak, 2);
  assert.equal(gate.snapshot().active, 0);
  assert.ok(calls.some((call) => call.coverage.providerAttempt.queueWaitMs > 0));
  assert.equal(calls[4].coverage.providerAttempt.attemptType, "repair");
  assert.equal(calls[0].coverage.providerAttempt.requestedOutputTokens, RESEARCH_CATEGORY_MAX_TOKENS);
  assert.deepEqual(calls[0].coverage.providerUsage, {
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
  });
});

test("honors provider reset pressure without retrying and cancels queued work", async () => {
  const gate = createResearchProviderGate({ limit: 1 });
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

  const blockedGate = createResearchProviderGate({ limit: 1 });
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
  await assert.rejects(queued, { name: "ResearchCancelledError" });
  assert.equal(queuedFetchCalled, false);
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

test("issues every concurrent primary before awaiting category retrieval and preserves failures", async () => {
  let active = 0;
  let peak = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  const runPromise = orchestrateCategoryResearch(
    { name: "Atlas", location: "Texas" },
    {
      concurrent: true,
      retrieveCategory: async ({ categoryId }) => {
        active += 1;
        peak = Math.max(peak, active);
        started.push(categoryId);
        if (started.length === 3) release();
        await gate;
        active -= 1;
        if (categoryId === "water") throw new Error("isolated category failure");
        return { candidates: [], observedQueries: [`observed ${categoryId}`], toolCallCount: 1 };
      },
    },
  );
  const run = await runPromise;
  assert.equal(peak, 8);
  assert.equal(run.providerRequests, 8);
  assert.equal(run.categoryExecutions.water.state, "Provider failure");
  assert.equal(Object.keys(run.categoryExecutions).length, 8);
  assert.ok(run.toolCalls <= 32);
});

test("all primary provider opportunities precede document work", async () => {
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
        issued += 1;
        if (issued === 8) releaseProviders();
        await providersIssued;
        events.push(`document:${categoryId}`);
        return { candidates: [], providerRequestCount: 1 };
      },
    },
  );
  assert.equal(run.providerRequests, 8);
  assert.equal(events.slice(0, 8).every((event) => event.startsWith("provider:")), true);
  assert.ok(Object.values(run.categoryExecutions).every((execution) => execution.issuedPrimaryQuery));
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
  const response = responseRecorder();
  await handleResearchProjectRequest(request({
    name: "Project Rainier",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async () => {
      const start = providerCalls * 10;
      providerCalls += 1;
      const sources = Array.from({ length: 10 }, (_, index) => ({
        ...retrievedSource,
        url: `https://fixture.example/rainier/${start + index}`,
        title: `Project Rainier fixture document ${start + index}`,
      }));
      return singleCallResponse(validResearchResponse(), sources);
    },
    documentFetchImpl: async () => {
      documentCalls += 1;
      return new Response("<html><body>Project Rainier fixture passage.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
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
  assert.equal(identity.state, "Complete");
  assert.equal(identity.openedDocuments.length, 1);
  assert.deepEqual(identity.openedDocuments[0], {
    originalUrl: identityUrl,
    referringUrls: [identityUrl],
    resolvedUrl: identityUrl,
    canonicalUrl: identityUrl,
    opened: true,
    attempted: true,
    reusedReceipt: false,
    reusedFromCanonicalUrl: null,
    accessState: "accessible",
    accessOutcome: "retrieved",
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
    cache,
    fetchImpl: async () => {
      providerCalls += 1;
      return singleCallResponse();
    },
    documentFetchImpl: async () => new Response("<html><body>Project Atlas public filing.</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  };
  const first = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Cached Atlas", location: "Texas" }), first, options);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().researchCache.state, "updated");
  const second = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Cached Atlas", location: "Texas" }), second, options);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().researchCache.state, "fresh");
  assert.equal(providerCalls, 15);
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
    documentFetchImpl: async () => new Response("<html><body>Project Atlas public filing.</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
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

test("validates and preserves optional Compute Atlas known data", () => {
  assert.deepEqual(parseResearchProjectBody({
    name: "Atlas",
    location: "Texas",
    knownData: {
      capacity: 840,
      operator: " Atlas Compute ",
      status: "Planned",
      sourceUrl: "https://example.com/directory/atlas",
      ignored: "not allowed through",
    },
  }), {
    name: "Atlas",
    location: "Texas",
    knownData: {
      capacity: 840,
      operator: "Atlas Compute",
      status: "Planned",
      sourceUrl: "https://example.com/directory/atlas",
    },
  });
  assert.throws(() => parseResearchProjectBody({ name: "Atlas", location: "Texas", knownData: "bad" }), /knownData/);
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

test("prioritizes Texas authoritative sources while retaining comparable records", () => {
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
  assert.equal(retrieval[0].url, "https://www.ercot.com/grid/atlas");
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
  let documentCalls = 0;
  const categorySource = (categoryId, index) => {
    const isCanonicalReceipt = index === 0 && ["grid", "electricity"].includes(categoryId);
    const url = isCanonicalReceipt
      ? `https://agency.gov/${categoryId}/atlas-decision`
      : `https://plain.fixture/${categoryId}/atlas-${index}`;
    return {
      ...retrievedSource,
      url,
      ...(isCanonicalReceipt ? { canonicalUrl } : {}),
      title: `Project Atlas ${isCanonicalReceipt ? "official commission decision" : `${categoryId} fixture ${index}`}`,
      excerpt: "Project Atlas fixture passage.",
      claimPassage: "Project Atlas fixture passage.",
      claimSupport: RESEARCH_EVIDENCE_IDS.map((evidenceId) => ({ evidenceId, values: [42] })),
      exactProject: true,
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

  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      const prompt = JSON.parse(init.body).input?.[1]?.content ?? "";
      const categoryId = [
        ["project-identity", "Project identity"],
        ["grid", "Grid"],
        ["electricity", "Electricity"],
        ["water", "Water"],
        ["permitting-community", "Permitting and community"],
        ["construction-capital", "Construction and capital"],
        ["tenant-counterparty", "Tenant and counterparty"],
        ["climate-operational-hazard", "Climate and operational hazard"],
      ].find(([, label]) => prompt.includes(`observed ${label} category attempt`))?.[0] ?? "project-identity";
      return responseForCategory(categoryId);
    },
    documentFetchImpl: async () => {
      documentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 2));
      return new Response("<html><body>Project Atlas fixture passage.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });

  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.ok(providerCalls >= 8);
  assert.equal(documentCalls, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpensUsed, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudget, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  const grid = payload.researchAudit.categories.find((category) => category.categoryId === "grid");
  const electricity = payload.researchAudit.categories.find((category) => category.categoryId === "electricity");
  const gridReceipt = grid.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  const electricityReceipt = electricity.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  assert.equal(gridReceipt.opened, true);
  assert.equal(gridReceipt.reusedReceipt, false);
  assert.equal(electricityReceipt.opened, false);
  assert.equal(electricityReceipt.reusedReceipt, true);
  assert.deepEqual(electricityReceipt.referringUrls, [
    "https://agency.gov/grid/atlas-decision",
    "https://agency.gov/electricity/atlas-decision",
  ]);
  assert.ok(electricity.openedDocuments.some((document) =>
    document.originalUrl.startsWith("https://plain.fixture/electricity/")
    && document.attempted === true
    && document.opened === true));
  assert.ok(payload.researchAudit.categories
    .flatMap((category) => category.openedDocuments)
    .filter((document) => document.reusedReceipt === false && document.attempted === true)
    .every((document) => document.opened === true));
});

test("reuses one failed explicit canonical receipt across categories and counts one physical open", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-failed-canonical-receipt-test-"));
  const response = responseRecorder();
  const canonicalUrl = "https://records.fixture/project-atlas/blocked-decision?id=7";
  let documentCalls = 0;
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
        title: "Project Atlas blocked canonical decision",
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...retrievedSource,
        url: `https://plain.fixture/${categoryId}/atlas-${index}`,
        title: `Project Atlas ${categoryId} plain fixture ${index}`,
        excerpt: "Project Atlas fixture passage.",
        claimPassage: "Project Atlas fixture passage.",
        exactProject: true,
      })),
    ];
    return singleCallResponse(research, sources);
  };
  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    rateLimiter: { allow: () => ({ allowed: true }) },
    fetchImpl: async (_url, init) => {
      const prompt = JSON.parse(init.body).input?.[1]?.content ?? "";
      const categoryId = categoryLabels.find(([, label]) =>
        prompt.includes(`observed ${label} category attempt`))?.[0] ?? "grid";
      return responseForCategory(categoryId);
    },
    documentFetchImpl: async () => {
      documentCalls += 1;
      return new Response("blocked", { status: 403, headers: { "content-type": "text/plain" } });
    },
    categoryIds: categoryLabels.map(([categoryId]) => categoryId),
  });
  const payload = response.json();
  const grid = payload.researchAudit.categories.find((category) => category.categoryId === "grid");
  const electricity = payload.researchAudit.categories.find((category) => category.categoryId === "electricity");
  const gridReceipt = grid.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  const electricityReceipt = electricity.openedDocuments.find((document) => document.canonicalUrl === canonicalUrl);
  assert.equal(documentCalls, 7);
  assert.equal(payload.researchCoverage.physicalOpensUsed, 7);
  assert.equal(gridReceipt.accessState, "blocked");
  assert.equal(gridReceipt.accessOutcome, "http-403");
  assert.equal(gridReceipt.reusedReceipt, false);
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

  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Taylor County, Texas",
    forceRefresh: true,
  }), response, {
    apiKey: "server-secret-for-test",
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
      if (url.endsWith("-failed")) throw new Error("fixture connection failed");
      if (url.endsWith("-blocked")) {
        return new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<html><body>Project Atlas fixture passage.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    categoryIds: categoryLabels.map(([categoryId]) => categoryId),
  });

  const payload = response.json();
  const documents = payload.researchAudit.categories.flatMap((category) => category.openedDocuments);
  const physicalReceipts = documents.filter((document) =>
    document.reusedReceipt !== true && document.attempted === true && document.opened === true);
  const failedReceipt = documents.find((document) => document.originalUrl.endsWith("-failed"));
  const blockedReceipt = documents.find((document) => document.originalUrl.endsWith("-blocked"));
  const budgetLimitedDocuments = documents.filter((document) => document.accessOutcome === "physical-open-budget");

  assert.equal(response.statusCode, 200);
  assert.equal(documentCalls, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpensUsed, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(payload.researchCoverage.physicalOpenBudgetExceeded, true);
  assert.equal(physicalReceipts.length, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens);
  assert.equal(new Set(physicalReceipts.map((document) => document.originalUrl)).size, physicalReceipts.length);
  assert.equal(failedReceipt.opened, true);
  assert.equal(failedReceipt.attempted, true);
  assert.equal(failedReceipt.accessState, "blocked");
  assert.equal(failedReceipt.accessOutcome, "network-failure");
  assert.equal(blockedReceipt.opened, true);
  assert.equal(blockedReceipt.attempted, true);
  assert.equal(blockedReceipt.accessState, "blocked");
  assert.equal(blockedReceipt.accessOutcome, "http-403");
  assert.ok(budgetLimitedDocuments.length > 0);
  assert.ok(budgetLimitedDocuments.every((document) =>
    document.opened === false && document.attempted === false && document.reusedReceipt === false));
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
  assert.equal(sources.length, 0);
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
    documentFetchImpl: async () => new Response(
      "<html><body>Wintersburg 313 construction is scheduled for completion in six months.</body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ),
    categoryIds: ["permitting-community"],
  });
  const payload = response.json();
  const source = payload.sourceLedger.find((candidate) => candidate.originalUrl === sourceUrl);
  const category = payload.researchAudit.categories.find((candidate) => candidate.categoryId === "permitting-community");
  assert.equal(response.statusCode, 200);
  assert.equal(source.accessOutcome.state, "accessible");
  assert.equal(source.accessOutcome.physicalOpenIndex, 1);
  assert.equal(source.accessOutcome.passage, "Wintersburg 313 construction is scheduled for completion in six months.");
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
  const result = parseResearchResponse(body, [{
    ...retrievedSource,
    sourceClass: "primary-government",
  }]);
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
  const parsed = parseResearchResponse(research, [{
    ...retrievedSource,
    sourceClass: "primary-government",
  }], "2026-09-03", {
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
    claimPassage: "Project Atlas filing reports 365 exact project.",
    description: "The decision establishes the project-specific interconnection timeline.",
    claimTimePeriod: "2026",
  });
  const redirectedSource = {
    ...retrievedSource,
    url: originalUrl,
    resolvedUrl: finalUrl,
    canonicalUrl: finalUrl,
    title: "Project Atlas Arizona Corporation Commission decision",
    excerpt: "Project Atlas filing reports 365 exact project.",
    claimPassage: "Project Atlas filing reports 365 exact project.",
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
      passage: "Project Atlas filing reports 365 exact project.",
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
  assert.equal(record.claimMappings[0].supportStatus, "supported");
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
    claimPassage: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
    description: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
    facilityScope: "exact-project",
    phaseScope: "not-applicable",
    claimTimePeriod: "2026",
  });
  const source = {
    ...retrievedSource,
    url: sourceUrl,
    title: "Retrieved public source",
    excerpt: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
    claimPassage: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
    claimSupport: [{ evidenceId: "water_consumption", values: [12] }],
    sourceClass: "secondary-reporting",
    facilityScope: "exact-project",
    phaseScope: "not-applicable",
    timePeriod: "2026",
    accessOutcome: {
      state: "accessible",
      passage: "The Phoenix campus reports 12 Mgal/year of cooling water use.",
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
    claimPassage: "A different public fact about Project Atlas.",
    excerpt: "A different public fact about Project Atlas.",
    claimSupport: [],
    accessOutcome: { state: "accessible", passage: "A different public fact about Project Atlas." },
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
  assert.ok(record.quarantineReasons.some((reason) => /source named|inaccessible|mapped claim/i.test(reason)));
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

test("uses bounded category web-search calls with scoped strict schemas", async () => {
  const response = responseRecorder();
  let requestUrl;
  let requestInit;
  let calls = 0;
  let providerCalls = 0;
  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Texas",
    knownData: { operator: "Atlas Compute" },
  }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-research-schema-")) }),
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
       calls += 1;
       if (url === OPENAI_RESPONSES_URL) providerCalls += 1;
      const researched = validResearchResponse();
      researched.evidence[1].value = "Company-reported cooling arrangement";
      return singleCallResponse(researched);
    },
    documentFetchImpl: async () => new Response("<html><body>Project Atlas public filing.</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.ok(providerCalls >= 8 && providerCalls <= 16);
  assert.ok(providerCalls > 8);
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
  assert.equal(body.max_output_tokens, RESEARCH_CATEGORY_MAX_TOKENS);
  assert.ok(body.max_tool_calls > 0 && body.max_tool_calls <= RESEARCH_PROJECT_MAX_TOOL_CALLS);
  assert.deepEqual(body.tools, [{ type: "web_search_preview" }]);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  const scopedIds = Object.keys(body.text.format.schema.properties.evidence.properties);
  assert.ok(scopedIds.length <= 4);
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
  assert.ok(body.evidence[0].sources.every((source) => source.accessOutcome?.state === "blocked"));
  assert.ok(body.evidence.every((item) => item.eligibleForModel !== true));
  assert.ok(body.researchAudit.categories.every((category) => category.stageCounts.accessed === 0));
  assert.ok(body.researchAudit.categories.some((category) => category.state === "No eligible evidence" || category.state === "Partial"));
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
    documentFetchImpl: async () => {
      documentFetches += 1;
      return new Response("<html><body>Project Atlas filing passage.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(
    documentFetches,
    RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
    "concurrent categories must stop at the shared physical-document ceiling",
  );
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
  let providerCalls = 0;
  const response = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Ledger Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    cache: createResearchProjectCache({ directory }),
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      const payload = JSON.parse(init.body);
      const prompt = payload.input?.[1]?.content ?? "";
      const label = Object.keys(categoryEvidence).find((candidate) => prompt.includes(`observed ${candidate} category attempt`)) ?? "Project identity";
      const evidenceId = categoryEvidence[label];
      const sourceUrl = `https://example.gov/${label.toLowerCase().replaceAll(" ", "-")}/source-${providerCalls}`;
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
          claimPassage: "Project Atlas filing reports 42 exact project.",
          description: "The filing reports a project-specific value.",
          claimTimePeriod: "2026",
        });
      }
      const source = {
        ...retrievedSource,
        url: sourceUrl,
        title: `Project Atlas ${label} filing`,
        excerpt: "Project Atlas filing reports 42 exact project.",
        claimPassage: "Project Atlas filing reports 42 exact project.",
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
    documentFetchImpl: async () => new Response("<html><body>Project Atlas filing reports 42 exact project.</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.ok(providerCalls >= 3);
  assert.ok(body.researchCoverage.sourceLedgerSummary.retainedCount > 10);
  const water = body.evidence.find((item) => item.id === "water_consumption");
  assert.equal(water.eligibleForModel, true);
  assert.ok(body.sourceLedger?.some((source) => source.originalUrl?.includes("/electricity/source-")));
});

test("returns exactly 16 normalized evidence items and safely falls back for invalid capacity", () => {
  const response = parseResearchResponse({
    ...validResearchResponse(),
    projectSummary: { ...validResearchResponse().projectSummary, capacityMW: Number.NaN },
  });
  assert.equal(response.evidence.length, 16);
  assert.deepEqual(response.evidence.map((item) => item.id), RESEARCH_EVIDENCE_IDS);
  assert.equal(response.projectSummary.capacityMW, DEFAULT_RESEARCH_CAPACITY_MW);
  assert.equal(response.projectSummary.capacityProvenance, "standardized-default");
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
      excerpt: "The filing describes Project Kilby power plans.",
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
      excerpt: "The facility is described as behind-the-meter generation and not dependent on a new ERCOT interconnection.",
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
      excerpt: "The project plans to use brackish groundwater.",
      sourceClass: "primary-company",
      searchDomain: "water-environment",
      exactProject: true,
      claimSupport: [{ evidenceId: "water_source_resilience", value: "brackish groundwater" }],
      facilityScope: "exact-facility",
      phaseScope: "exact-phase",
      timePeriod: "2026",
    },
  ];
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
  const first = parseResearchResponse(body, [retrievedSource]);
  const second = parseResearchResponse(first, [retrievedSource]);
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
  const parsed = parseResearchResponse(validResearchResponse(), [retrievedSource], "2026-08-30");
  assert.equal(parsed.evidence[0].sourceUrl, retrievedSource.url);
  assert.equal(parsed.evidence[1].sourceUrl, retrievedSource.url);
  assert.equal(parsed.evidence[0].sourceTitle, retrievedSource.title);
  assert.equal(parsed.evidence[0].sourcePublisher, "example.com");
  assert.equal(parsed.evidence[0].sourcePublishedAt, "2026-06-01");
  assert.equal(parsed.evidence[0].sourceAccessedAt, "2026-08-30");
  assert.equal(parsed.evidence[0].sourceAccessStatus, "not provided");

  const untrusted = validResearchResponse();
  untrusted.evidence[0].sourceUrl = "javascript:alert(1)";
  untrusted.evidence[1].sourceUrl = "https://example.com/not-in-packet";
  const untrustedParsed = parseResearchResponse(untrusted, [retrievedSource]);
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
      excerpt: "Trade reporting summarizes environmental questions.",
      sourceClass: "secondary-reporting",
      searchDomain: "water-environment",
    },
    {
      url: "https://dnr.alaska.gov/mlw/decision/project-atlas",
      title: "Alaska DNR final decision for Project Atlas",
      excerpt: "Final agency decision for the exact Project Atlas site.",
      sourceClass: "primary-government",
      searchDomain: "water-environment",
    },
  ]);
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
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), providerResponse, {
    apiKey: "server-secret-for-test",
    cache,
    rateLimiter,
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: "Billing allocation reached.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    }), { status: 429, headers: { "content-type": "application/json" } }),
  });
  assert.equal(providerResponse.statusCode, 429);
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
  assert.equal(timeoutResponse.json().researchError.type, "malformed-response");
  assert.equal(timeoutResponse.json().evidence.length, 16);
});