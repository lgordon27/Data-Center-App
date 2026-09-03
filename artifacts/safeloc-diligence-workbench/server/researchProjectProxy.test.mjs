import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_RESEARCH_CAPACITY_MW,
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  buildResearchProjectPrompt,
  handleResearchProjectRequest,
  parseResearchResponse,
  createResearchProjectRateLimiter,
  safePublicSourceUrl,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  normalizeRetrievedSources,
  extractSearchTerms,
  calculateSourceSupportConfidence,
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
      ...(index === 1 ? { sourceUrl: "https://example.com/atlas/source" } : {}),
      ...(index === 0 ? { numericValue: 42 } : {}),
      ...(id === "site_hazard_exposure" ? { qualitativeValue: "high" } : {}),
      ...(id === "water_source_resilience" ? { qualitativeValue: "single-source" } : {}),
    })),
  };
}

const retrievedSource = {
  url: "https://example.com/atlas/source",
  title: "Project Atlas public filing",
  date: "2026-06-01",
  excerpt: "A public source excerpt about Project Atlas.",
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

test("uses a 90-second server research budget", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 90_000);
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
    fetchImpl: async () => new Response("private quota detail", { status: 429 }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().researchCache.state, "stale");
  assert.equal(response.json().researchCache.providerAvailable, false);
  assert.equal(response.json().researchCache.errorType, "quota-exhausted");
  assert.equal(response.json().evidence.length, 16);
  assert.doesNotMatch(response.body, /private quota detail/i);
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
  });
  assert.equal(stale.json().researchCache.refreshStatus, "running");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const status = responseRecorder();
  await handleResearchProjectRequest({ method: "GET", url: `/api/research-project?cacheKey=${key}` }, status, { cache });
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
    knownData: { capacity: 840, operator: "Atlas Compute", status: "Planned" },
  }, [retrievedSource]);
  assert.match(prompt, /Compute Atlas public database/);
  assert.match(prompt, /not as SafeLoc evidence or verified project economics/);
  assert.doesNotMatch(prompt, /using only the retrieved sources/i);
  assert.match(prompt, /Management Assertion or lower/);
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

test("preserves annotated retrieval text as the claim-specific source excerpt", () => {
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
  assert.equal(sources[0].excerpt, "Project Kilby will provide dedicated power directly to a Microsoft-operated data center under a 20-year agreement.");
  assert.equal(sources[0].searchDomain, "targeted-customer_concentration");
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
  }], "2026-09-03", { searchTerms: ["Project Atlas filing"] });
  assert.deepEqual(parsed.evidence[0].sources.map((source) => source.url), [retrievedSource.url]);
  assert.equal(parsed.evidence[0].sourceSupportConfidence, 82);
  assert.equal(parsed.evidence[0].sourceRelevance, "exact-project");
  assert.match(parsed.evidence[0].classificationReason, /public filing/);
  assert.equal(parsed.evidence[0].searchTermsSource, "tool-observed");
  assert.deepEqual(parsed.evidence[0].searchTerms, ["Project Atlas filing"]);
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

test("uses exactly one web-search-enabled API call with the strict 16-item schema", async () => {
  const response = responseRecorder();
  let requestUrl;
  let requestInit;
  let calls = 0;
  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Texas",
    knownData: { operator: "Atlas Compute" },
  }), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      calls += 1;
      const researched = validResearchResponse();
      researched.evidence[1].value = "Company-reported cooling arrangement";
      return singleCallResponse(researched);
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(response.json().evidence[1].classification, "Management Assertion");
  assert.equal(response.json().evidence[1].sourceUrl, retrievedSource.url);
  assert.equal(requestUrl, OPENAI_RESPONSES_URL);
  const body = JSON.parse(requestInit.body);
  assert.equal(body.model, RESEARCH_PROJECT_MODEL);
  assert.equal(body.max_output_tokens, RESEARCH_PROJECT_MAX_TOKENS);
  assert.deepEqual(body.tools, [{ type: "web_search_preview" }]);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema, RESEARCH_PROJECT_RESPONSE_SCHEMA);
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
  ]) {
    assert.match(RESEARCH_PROJECT_SYSTEM_PROMPT, new RegExp(phrase, "i"));
  }
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
    },
    {
      url: "https://www.ercot.com/gridinfo/project-kilby",
      title: "ERCOT Project Kilby grid record",
      excerpt: "The facility is described as behind-the-meter and not dependent on a new ERCOT interconnection.",
      sourceClass: "primary-government",
      searchDomain: "power-grid",
    },
    {
      url: "https://www.texaspacific.com/project-kilby-water",
      title: "Texas Pacific Land water disclosure",
      excerpt: "The project plans to use brackish groundwater.",
      sourceClass: "primary-company",
      searchDomain: "water-environment",
    },
  ];
  const power = body.evidence.find((item) => item.id === "electricity_cost");
  power.classification = "Management Assertion";
  power.value = 48;
  power.numericValue = 48;
  power.sourceUrl = sources[0].url;
  power.sourceUrls = [sources[0].url];
  power.citation = `Chevron describes the power arrangement: ${sources[0].url}`;
  const grid = body.evidence.find((item) => item.id === "grid_interconnection");
  grid.classification = "Verified Evidence";
  grid.value = "Behind-the-meter generation";
  grid.numericValue = 0;
  grid.sourceUrl = sources[1].url;
  grid.sourceUrls = [sources[1].url];
  grid.citation = `ERCOT records the grid arrangement: ${sources[1].url}`;
  const water = body.evidence.find((item) => item.id === "water_source_resilience");
  water.classification = "Management Assertion";
  water.value = "Brackish groundwater";
  water.qualitativeValue = "single-source";
  water.sourceUrl = sources[2].url;
  water.sourceUrls = [sources[2].url];
  water.citation = `The water source is disclosed here: ${sources[2].url}`;

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
  const incomplete = validResearchResponse();
  incomplete.evidence = incomplete.evidence.slice(0, 15);
    await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas", forceRefresh: true }), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async (_, init) => {
      assert.match(init.body, /web_search_preview/);
      return singleCallResponse(incomplete);
    },
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { error: "Project research returned an invalid 16-item response.", errorType: "malformed-response" });
  assert.doesNotMatch(response.body, /server-secret-for-test|provider/i);
});

test("returns specific safe quota, authentication, parse, and timeout errors", async () => {
  const providerResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), providerResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response("provider private detail", { status: 429 }),
  });
  assert.equal(providerResponse.statusCode, 429);
  assert.match(providerResponse.body, /quota is exhausted.*429/i);
  assert.doesNotMatch(providerResponse.body, /provider private detail/i);

  const authenticationResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), authenticationResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }),
  });
  assert.equal(authenticationResponse.statusCode, 502);
  assert.match(authenticationResponse.body, /authentication failed.*401/i);
  assert.doesNotMatch(authenticationResponse.body, /invalid key|server-secret-for-test/i);

  const parseResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), parseResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });
  assert.equal(parseResponse.statusCode, 502);
  assert.match(parseResponse.body, /invalid JSON/i);

  const timeoutResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), timeoutResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  assert.equal(timeoutResponse.statusCode, 504);
});