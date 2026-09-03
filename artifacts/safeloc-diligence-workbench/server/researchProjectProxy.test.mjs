import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RESEARCH_CAPACITY_MW,
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_SEARCH_DOMAINS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  buildResearchProjectPrompt,
  mergeRetrievedSources,
  handleResearchProjectRequest,
  parseResearchResponse,
  createResearchProjectRateLimiter,
  safePublicSourceUrl,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  normalizeRetrievedSources,
} from "./researchProjectProxy.mjs";

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

function retrievalResponse() {
  return new Response(JSON.stringify({
    output: [{ type: "web_search_call", action: { sources: [retrievedSource] } }],
  }), { status: 200 });
}

test("uses a 60-second server research budget", () => {
  assert.equal(RESEARCH_PROJECT_TIMEOUT_MS, 60_000);
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

test("enforces per-search and combined source caps while prioritizing targeted results", () => {
  const retrieval = normalizeRetrievedSources({
    output: [{ type: "web_search_call", action: { sources: Array.from({ length: 12 }, (_, index) => ({
      url: `https://example.com/search/${index}`,
      title: `Result ${index}`,
    })) } }],
  });
  assert.equal(retrieval.length, 10);

  const source = (group, index) => ({
    url: `https://example.com/${group}/${index}`,
    title: `${group} ${index}`,
    excerpt: "Project-specific source.",
    sourceClass: "secondary-reporting",
    searchDomain: group,
  });
  const merged = mergeRetrievedSources(
    Array.from({ length: 40 }, (_, index) => source("initial", index)),
    Array.from({ length: 5 }, (_, index) => source("targeted", index)),
  );
  assert.equal(merged.length, 40);
  assert.deepEqual(merged.slice(0, 5).map(({ searchDomain }) => searchDomain), Array(5).fill("targeted"));
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
    fetchImpl: async (_, init) => init.body.includes("web_search_preview")
      ? retrievalResponse()
      : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validResearchResponse()) } }] }), { status: 200 }),
  };
  await handleResearchProjectRequest(request({ name: "Atlas", location: "Texas" }), responseRecorder(), options);
  const limited = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Atlas", location: "Texas" }), limited, options);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "60");
  assert.match(limited.body, /request limit/i);
  now += 60_001;
  const allowedAgain = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Atlas", location: "Texas" }), allowedAgain, options);
  assert.equal(allowedAgain.statusCode, 200);
});

test("sends bounded research settings and the expanded out-of-model instruction", async () => {
  const response = responseRecorder();
  let requestUrl;
  let requestInit;
  let retrievalCalls = 0;
  let synthesisCalls = 0;
  const retrievalInputs = [];
  await handleResearchProjectRequest(request({
    name: "Project Atlas",
    location: "Texas",
    knownData: { operator: "Atlas Compute" },
  }), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async (url, init) => {
      if (url === OPENAI_RESPONSES_URL) {
        retrievalCalls += 1;
        retrievalInputs.push(JSON.parse(init.body).input);
        assert.equal(url, OPENAI_RESPONSES_URL);
        return retrievalResponse();
      }
      requestUrl = url;
      requestInit = init;
      synthesisCalls += 1;
      const synthesized = validResearchResponse();
      if (synthesisCalls === 2) {
        synthesized.evidence[1].value = "Company-reported cooling arrangement";
        synthesized.evidence[1].classification = "Management Assertion";
        synthesized.evidence[1].sourceUrl = retrievedSource.url;
        synthesized.evidence[1].sourceUrls = [retrievedSource.url];
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(synthesized) } }],
      }), { status: 200 });
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(retrievalCalls, 26);
  assert.equal(synthesisCalls, 2);
  assert.equal(response.json().evidence[1].classification, "Management Assertion");
  assert.equal(response.json().evidence[1].sourceUrl, retrievedSource.url);
  for (const input of retrievalInputs.slice(0, 10)) {
    assert.match(input, /Project Atlas/);
    assert.match(input, /Texas/);
    assert.match(input, /Atlas Compute/);
  }
  assert.deepEqual(
    RESEARCH_SEARCH_DOMAINS.map((domain) => domain.id),
    ["project-general", "industry-context", "operator-location", "sec-filings", "press-releases", "operator-infrastructure", "community-zoning", "grid-interconnection", "environmental-water", "technical-capacity"],
  );
  assert.match(retrievalInputs[12], /grid interconnection ERCOT behind the meter/);
  assert.equal(requestUrl, OPENAI_CHAT_COMPLETIONS_URL);
  const body = JSON.parse(requestInit.body);
  assert.equal(body.model, RESEARCH_PROJECT_MODEL);
  assert.equal(body.max_tokens, RESEARCH_PROJECT_MAX_TOKENS);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema, RESEARCH_PROJECT_RESPONSE_SCHEMA);
  assert.match(body.messages[1].content, /targeted-electricity_cost/);
  assert.match(body.messages[1].content, /https:\/\/example\.com\/atlas\/source/);
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
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async (_, init) => {
      if (init.body.includes("web_search_preview")) return retrievalResponse();
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(incomplete) } }],
      }), { status: 200 });
    },
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { error: "Project research returned an invalid 16-item response." });
  assert.doesNotMatch(response.body, /server-secret-for-test|provider/i);
});

test("returns safe upstream and timeout errors", async () => {
  const providerResponse = responseRecorder();
  await handleResearchProjectRequest(request({ name: "Project Atlas", location: "Texas" }), providerResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response("provider private detail", { status: 429 }),
  });
  assert.equal(providerResponse.statusCode, 502);
  assert.doesNotMatch(providerResponse.body, /provider private detail/i);

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