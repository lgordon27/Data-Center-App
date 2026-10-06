import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportedResearchFindings } from "../src/components/ReportedResearchFindings.tsx";
import { parseReportedResearchFindings, parseResponse } from "../src/services/researchProjectService.ts";
import { createResearchProviderGate, runValidatedResearch, buildReportedResearchFindings } from "./researchProjectProxy.mjs";
import { project, permitUrl, permitPassage, permitSource } from "./fixtures/syntheticExaminationPermit.mjs";
import {
  FINDING_TOPICS, createFindingsTokenBudget, extractResearchFindings, findingsConfig,
  notAnalyzedTopicCoverage, prepareFindingsPassages, verifyResearchFindings,
  boundedFindingsDiscoveryFetch,
} from "./researchFindings.mjs";
import { assessResearchFindingProjectMatch, extractResearchEntityRoles } from "../src/data/researchIdentity.mjs";
import { containResearchResult } from "./researchProjectProxy.mjs";
import { assessFindingsPassageAdmission } from "../src/data/researchIdentity.mjs";

test("A2 findings admission accepts Kilby or operator plus state/city/county without granting identity", () => {
  const identity = { name: "Project Kilby", location: "Pecos, Reeves County, Texas",
    knownData: { operator: "Chevron", city: "Pecos", county: "Reeves County", state: "Texas" } };
  for (const passage of [
    "Project Kilby will be developed in West Texas.",
    "Chevron plans a power campus in Texas.",
    "Chevron plans a power campus near Pecos.",
    "Chevron plans a power campus in Reeves County.",
  ]) assert.equal(assessFindingsPassageAdmission(passage, identity).eligible, true, passage);
  for (const passage of [
    "Chevron plans Project Other in Texas.",
    "Project Kilby is located in Phoenix, Arizona.",
    "A power campus is planned in Texas.",
  ]) assert.equal(assessFindingsPassageAdmission(passage, identity).eligible, false, passage);
  assert.equal(assessResearchFindingProjectMatch("Project Kilby will be developed in West Texas.", identity).matches, false);
});

test("A2 extraction enforces configured model, output cap, measured latency and actual usage", async () => {
  const previous = process.env.OPENAI_RESEARCH_MODEL;
  process.env.OPENAI_RESEARCH_MODEL = "fixture-configured-model";
  let clock = 10;
  const budget = createFindingsTokenBudget().begin();
  try {
    const result = await extractResearchFindings({
      project: kilbyProject, sources: [gasSource], apiKey: "fixture", signal: new AbortController().signal,
      deadlineAt: 100_000, now: () => clock, runBudget: budget,
      providerGate: { run: (fn) => fn() },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.equal(body.model, "fixture-configured-model");
        assert.equal(body.max_output_tokens, 8000);
        assert.equal(body.text.format.schema.properties.findings.maxItems, 25);
        assert.equal(body.text.format.schema.properties.findings.items.properties.statement.maxLength, 300);
        clock += 123;
        return { ok: true, json: async () => ({ output_text: JSON.stringify(extractionResponse()), usage: { total_tokens: 456 } }) };
      },
    });
    assert.equal(result.audit.extractionLatencyMs, 123);
    assert.deepEqual(result.audit.usage, { total_tokens: 456 });
  } finally {
    budget.finish();
    if (previous === undefined) delete process.env.OPENAI_RESEARCH_MODEL;
    else process.env.OPENAI_RESEARCH_MODEL = previous;
  }
});

// All findings-first controls below are synthetic, not live research captures.
const kilbyProject = {
  name: "Kilby Campus", location: "Abilene, Taylor County, Texas",
  knownData: { operator: "Microsoft", city: "Abilene", county: "Taylor County", state: "Texas" },
};
const gasQuote = "Chevron will supply natural gas for the Kilby Campus power plant.";
const kilbyPassage = `Kilby Campus is located in Abilene, Taylor County, Texas.
Chevron is the power developer. Microsoft is the data-center operator and offtaker.
${gasQuote}
The plant is proposed and its completion remains subject to permitting. This announcement does not disclose an electricity price, renewable-energy percentage, or tenant concentration percentage.`;
const gasSource = {
  url: "https://records.example.gov/synthetic-kilby", title: "Synthetic Kilby announcement",
  publisher: "Synthetic county authority", publishedAt: "2026-09-01",
  accessOutcome: { state: "accessible", passage: kilbyPassage, retrievalTime: "2026-10-06T12:00:00.000Z" },
};
const finding = (overrides = {}) => ({
  statement: "Chevron plans to supply natural gas for the Kilby Campus power plant.",
  exactQuotation: gasQuote, quotationVerified: true, topic: "power", kind: "plan",
  source: { url: gasSource.url, title: "Model may not overwrite metadata" },
  scope: { entityRoles: [{ name: "Unstated actor", role: "owner" }], facility: "Kilby Campus", phase: null, timeframe: null },
  projectMatch: "matches-requested-project", proposedModelMapping: null,
  ...overrides,
});
const analyzedCoverage = () => Object.fromEntries(FINDING_TOPICS.map((topic) =>
  [topic, { state: "analyzed-nothing-found", reason: null }]));
const suppliedGas = [{ source: gasSource, url: gasSource.url, passage: kilbyPassage }];
const extractionResponse = (findings = [finding()], topicCoverage = analyzedCoverage()) => ({ findings, topicCoverage });
const config = { ...findingsConfig({}), expectedCallMs: 1 };
const instantGate = { run: async (operation) => operation() };

test("findings-first retains a gas-supply plan without manufacturing financial inputs", () => {
  const result = verifyResearchFindings(kilbyProject, extractionResponse(), suppliedGas, ["ppa_price"]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].proposedModelMapping, null);
  assert.equal(result.findings[0].source.title, gasSource.title);
  assert.equal(result.findings[0].source.publishedAt, "2026-09-01");
  assert.equal(result.findings[0].projectMatch, "matches-requested-project");
  assert.equal(result.findings[0].quotationVerified, true);
  assert.deepEqual(result.audit.dropsByReason, {});
});

test("findings-first drops fabricated quotations and citations to unsupplied URLs", () => {
  const result = verifyResearchFindings(kilbyProject, extractionResponse([
    finding(), finding({ exactQuotation: "Electricity costs exactly three cents." }),
    finding({ source: { url: "https://unopened.example.gov/record" } }),
    finding({ exactQuotation: "Chevron" }),
  ]), suppliedGas);
  assert.equal(result.findings.length, 1);
  assert.equal(result.audit.findingsDropped, 3);
  assert.deepEqual(result.audit.dropsByReason, {
    "quotation-not-in-supplied-passage": 1, "source-not-supplied": 1, "quotation-too-short": 1,
  });
});

test("finding IDs are stable under quote whitespace, curly quotes, and case normalization", () => {
  const original = verifyResearchFindings(kilbyProject, extractionResponse(), suppliedGas).findings[0];
  const variant = verifyResearchFindings(kilbyProject, extractionResponse([
    finding({ exactQuotation: gasQuote.toUpperCase().replaceAll(" ", " \n ") }),
  ]), suppliedGas).findings[0];
  assert.equal(original.findingId, variant.findingId);
});

test("Chevron developer and Microsoft operator/offtaker are distinct source roles", () => {
  const roles = extractResearchEntityRoles(kilbyPassage);
  assert.ok(roles.some((role) => role.name === "Chevron" && role.role === "developer"));
  assert.ok(roles.some((role) => role.name === "Microsoft" && role.role === "operator"));
  assert.ok(roles.some((role) => role.name === "Microsoft" && role.role === "offtaker"));
  assert.equal(assessResearchFindingProjectMatch(kilbyPassage, kilbyProject).matches, true);
  const prepared = prepareFindingsPassages(kilbyProject, [gasSource], config);
  assert.equal(prepared.selected.length, 1);
});

test("explicit wrong location is excluded before extraction and during verification", () => {
  const passage = kilbyPassage.replaceAll("Abilene, Taylor County", "Plano, Collin County");
  const wrong = { ...gasSource, accessOutcome: { state: "accessible", passage } };
  assert.equal(prepareFindingsPassages(kilbyProject, [wrong], config).selected.length, 0);
  const result = verifyResearchFindings(kilbyProject, extractionResponse(),
    [{ source: wrong, url: gasSource.url, passage }]);
  assert.equal(result.findings.length, 0);
  assert.equal(result.audit.dropsByReason["explicit-project-conflict"], 1);
});

test("explicitly different project is excluded despite name/location co-occurrence", () => {
  const passage = `Westgate Campus in Abilene, Taylor County, Texas is not the Kilby Campus.
Microsoft is the operator. ${gasQuote} This quotation is included for comparison only, not as an assertion about Westgate.`;
  const unrelated = { ...gasSource, accessOutcome: { state: "accessible", passage } };
  assert.equal(prepareFindingsPassages(kilbyProject, [unrelated], config).selected.length, 0);
  const result = verifyResearchFindings(kilbyProject, extractionResponse(),
    [{ source: unrelated, url: gasSource.url, passage }]);
  assert.equal(result.audit.dropsByReason["explicit-project-conflict"], 1);
});

test("Red Oak label/value permit remains a finding with unconfirmed campus scope", () => {
  const prepared = prepareFindingsPassages(project, [permitSource], config);
  assert.equal(prepared.selected.length, 1);
  const result = verifyResearchFindings(project, extractionResponse([finding({
    exactQuotation: "Estimated Cost: $130,000,000", statement: "The DFW13 application estimates construction cost at $130 million.",
    topic: "construction", kind: "estimate", source: { url: permitUrl },
    scope: { facility: "DFW13", phase: null, timeframe: null },
  })]), prepared.selected);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].projectMatch, "scope-unconfirmed");
  assert.equal(result.findings[0].scope.facility, "DFW13");
});

test("topic coverage distinguishes verified findings, nothing found, and not analyzed", () => {
  const coverage = analyzedCoverage();
  coverage.water = { state: "not-analyzed", reason: "no-water-passage" };
  const result = verifyResearchFindings(kilbyProject, extractionResponse([finding()], coverage), suppliedGas);
  assert.deepEqual(result.topicCoverage.power, { state: "analyzed-findings", reason: null });
  assert.deepEqual(result.topicCoverage.tenant, { state: "analyzed-nothing-found", reason: null });
  assert.deepEqual(result.topicCoverage.water, { state: "not-analyzed", reason: "no-water-passage" });
  assert.equal(Object.keys(result.topicCoverage).length, 12);
});

test("proposals remain proposals and server ignores model identity and quote verification flags", () => {
  const result = verifyResearchFindings(kilbyProject, extractionResponse([finding({
    quotationVerified: false, projectMatch: "scope-unconfirmed",
    proposedModelMapping: { evidenceId: "ppa_price", proposedValue: 0.03, status: "accepted" },
  })]), suppliedGas, ["ppa_price"]);
  assert.equal(result.findings[0].quotationVerified, true);
  assert.equal(result.findings[0].projectMatch, "matches-requested-project");
  assert.equal(result.findings[0].proposedModelMapping.status, "proposed-not-accepted");
});

test("passage deduplication and input omissions are recorded without truncating quotations", () => {
  const second = { ...gasSource, url: "https://records.example.gov/duplicate" };
  const prepared = prepareFindingsPassages(kilbyProject, [gasSource, second], config);
  assert.equal(prepared.selected.length, 1);
  assert.equal(prepared.omittedSources[0].reason, "duplicate-passage");
  const bounded = prepareFindingsPassages(kilbyProject, [gasSource], { ...config, inputTokens: 1 });
  assert.equal(bounded.selected.length, 0);
  assert.equal(bounded.omittedSources[0].reason, "extraction-input-budget");
});

test("run cap and daily cap reject reservations, retain unknown usage, reset at UTC midnight", () => {
  let now = Date.parse("2026-10-06T12:00:00Z");
  const budget = createFindingsTokenBudget({ now: () => now });
  const bounded = { ...config, runTokenCap: 100, dailyTokenCap: 100 };
  const run = budget.begin(bounded);
  assert.throws(() => run.reserve(101), /run token limit/);
  run.reserve(50); run.issued(); run.usage(null); run.finish();
  assert.throws(() => budget.begin(bounded), /daily token limit/);
  now = Date.parse("2026-10-07T00:00:00Z");
  const next = budget.begin(bounded);
  next.finish();
  assert.equal(budget.snapshot().reservedTokens, 0);
});

test("expected 35-second latency prevents a call that cannot finish before deadline", async () => {
  let calls = 0;
  const runtimeConfig = findingsConfig({});
  const runBudget = createFindingsTokenBudget().begin(runtimeConfig);
  const result = await extractResearchFindings({
    project: kilbyProject, sources: [gasSource], apiKey: "synthetic",
    fetchImpl: async () => { calls += 1; throw new Error("Must not issue"); },
    signal: new AbortController().signal, deadlineAt: Date.now() + 10_000,
    providerGate: instantGate, runBudget, config: runtimeConfig,
  });
  runBudget.finish();
  assert.equal(calls, 0);
  assert.equal(result.topicCoverage.power.reason, "expected-latency-exceeds-deadline");
  assert.equal(result.audit.passagesSent, 0);
});

test("custom discovery bounds generated tokens and rejects an oversized request before issue", async () => {
  let requests = 0;
  const fetcher = boundedFindingsDiscoveryFetch(async (_url, init) => {
    requests += 1;
    assert.ok(JSON.parse(init.body).generation_config.max_output_tokens <= config.discoveryTokens);
    return new Response("{}");
  }, config);
  await fetcher("https://provider.example.test/interactions", { body: JSON.stringify({ input: "Synthetic discovery" }) });
  await assert.rejects(fetcher("https://provider.example.test/interactions",
    { body: JSON.stringify({ input: "x".repeat(config.discoveryTokens * 3) }) }), /run token limit/);
  assert.equal(requests, 1);
});

test("extraction run cap withholds a prepared request without recording it as issued", async () => {
  let requests = 0;
  const tiny = { ...config, runTokenCap: 100 };
  const runBudget = createFindingsTokenBudget().begin(tiny);
  const result = await extractResearchFindings({
    project: kilbyProject, sources: [gasSource], apiKey: "synthetic",
    fetchImpl: async () => { requests += 1; throw new Error("Must not issue"); },
    signal: new AbortController().signal, deadlineAt: Date.now() + 1000,
    providerGate: instantGate, runBudget, config: tiny,
  });
  runBudget.finish();
  assert.equal(requests, 0);
  assert.equal(result.audit.providerAttempts[0].requestState, "not-issued");
  assert.equal(result.audit.providerAttempts[0].issuedAt, null);
  assert.equal(result.topicCoverage.power.reason, "run-token-cap");
});

test("single extraction sends all admitted passages without web search or financial calls", async () => {
  let calls = 0;
  const runBudget = createFindingsTokenBudget().begin(config);
  const result = await extractResearchFindings({
    project: kilbyProject, sources: [gasSource], apiKey: "synthetic",
    fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gpt-6.1-sol");
      assert.equal(body.reasoning.effort, "low");
      assert.equal(body.tools, undefined);
      assert.ok(body.input[1].content.includes(gasQuote));
      return new Response(JSON.stringify({ output_text: JSON.stringify(extractionResponse()),
        usage: { input_tokens: 2000, output_tokens: 500, total_tokens: 2500 } }));
    },
    signal: new AbortController().signal, deadlineAt: Date.now() + 1000,
    providerGate: instantGate, runBudget, config,
  });
  runBudget.finish();
  assert.equal(calls, 1);
  assert.equal(result.audit.passagesSent, 1);
  assert.equal(result.audit.findingsVerified, 1);
  assert.equal(result.audit.providerAttempts[0].requestState, "completed");
  assert.equal(result.audit.usage.total_tokens, 2500);
});

test("custom orchestration skips all financial categories and leaves zero financial inputs", async () => {
  let extractionCalls = 0;
  const result = await runValidatedResearch(kilbyProject, {
    findingsFirst: true, findingsOptions: { config, tokenBudget: createFindingsTokenBudget() },
    apiKey: "synthetic", googleApiKey: null,
    googleDiscoveryImpl: async () => ({ candidates: [gasSource], queries: [],
      providerAttempt: { issuedAt: "2026-10-06T12:00:00Z", usage: { total_tokens: 100 } } }),
    fetchImpl: async (_url, init) => {
      extractionCalls += 1;
      assert.equal(JSON.parse(init.body).tools, undefined);
      return new Response(JSON.stringify({ output_text: JSON.stringify(extractionResponse()), usage: { total_tokens: 2500 } }));
    },
    documentFetchImpl: async () => new Response(`<html><body><p>${kilbyPassage}</p></body></html>`,
      { headers: { "content-type": "text/html" } }),
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    rateLimiter: { allow: () => ({ allowed: true }) }, req: {},
    useDefaultSecConnector: false, researchTimeoutMs: 5000, analysisReserveMs: 100,
    providerGate: createResearchProviderGate({ tokenWindowMs: 10 }),
  });
  assert.equal(extractionCalls, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.reportedFindings.length, 1);
  assert.equal(result.evidence.length, 16);
  assert.ok(result.evidence.every((item) => item.classification === "Not assessed"
    && item.assessmentReason === "financial-mapping-not-run"));
  for (const field of ["eligibleEvidence", "proposedInputs", "acceptedInputs", "acceptedModelInputs"]) {
    assert.deepEqual(result[field], []);
  }
  assert.equal(result.researchAudit.outcomeMetrics.categoryCompletion.executed, 0);
  assert.equal(containResearchResult(result).findings.length, 1);
  assert.equal(containResearchResult(result).evidence[0].classification, "Not assessed");
});

const quote = "Estimated Start Date: 03/01/2026";
const reportedClaim = {
  id: "permitting_timeline", label: "Estimated start date", value: "03/01/2026", unit: "date",
  classification: "Management Assertion", citation: permitUrl, description: "The application reports an estimated start date.",
  sourceRole: "Application", sourceUrl: permitUrl, sourceUrls: [permitUrl], conflictSummary: null,
  coverageStatus: "partial", numericValue: null, modelReportedConfidence: null, sourceSupportConfidence: 0,
  classificationReason: "Reported application date, not a verified campus schedule.",
  sourceRelevanceNote: "Specific building; campus identity unresolved.", sourceRelevance: "unresolved",
  claimPassage: quote, facilityScope: "unknown", phaseScope: "unknown", claimTimePeriod: null,
  searchTerms: [], qualitativeValue: null,
};
const categoryResult = (claim = reportedClaim, source = permitSource) => ({
  categoryId: "permitting-community", rawResearch: { evidence: [claim] }, sources: [source],
});

async function runOffline(claimQuote) {
  const packets = [];
  const result = await runValidatedResearch(project, {
    apiKey: "offline-openai-fixture", googleApiKey: "offline-google-fixture",
    req: { ip: "198.51.100.20" },
    rateLimiter: { allow: () => ({ allowed: true, retryAfterSeconds: 0 }) },
    providerGate: createResearchProviderGate({ tokensPerMinute: 30_000, tokenWindowMs: 10 }),
    allowGoogleFallback: false, allowCorrectiveRetries: false, allowProviderRetries: false,
    useDefaultSecConnector: false, secConnector: null,
    researchBudgetOverrides: { maxFollowUps: 0, maxFollowUpsPerCategory: 0 },
    researchTimeoutMs: 12_000, analysisReserveMs: 0, documentTimeoutMs: 1_000,
    googleDiscoveryImpl: async () => ({
      status: "completed", provider: "google-gemini-grounding", model: "offline-fixture",
      queries: ["synthetic permit fixture"], candidates: [{ ...permitSource, accessOutcome: undefined, discoveryOnly: true }],
      groundingMetadataPresent: true, groundingSearchExecuted: true, usableCitationMetadataPresent: true,
      googleSearchCallCount: 1, googleSearchResultCount: 1, urlCitationCount: 1, citationCount: 1, providerRequestCount: 1,
    }),
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => {
      assert.equal(url, permitUrl);
      return new Response(`<html><head><title>Synthetic DFW13 application</title></head><body><main>${permitPassage.split("\n").map((line) => `<p>${line}</p>`).join("")}</main></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } });
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body);
      packets.push(body);
      assert.match(JSON.stringify(body.input), /scope-unconfirmed/i);
      assert.match(JSON.stringify(body.input), /Report their facility\/phase labels exactly as written/);
      const schema = body.text.format.schema;
      const summary = { ...project, description: "Synthetic category result", capacityMW: null, capacityProvenance: "unknown" };
      delete summary.knownData;
      const research = schema.properties.identityAssessment ? {
        projectSummary: summary,
        identityAssessment: { exactProjectIdentityEstablished: false, matchedName: null, matchedLocation: null, matchedOperator: null, reason: "Only the named building is reported." },
      } : {
        projectSummary: summary,
        evidence: Object.fromEntries(Object.keys(schema.properties.evidence.properties).map((id) =>
          [id, id === "permitting_timeline" ? { ...reportedClaim, claimPassage: claimQuote } : {
            ...reportedClaim, id, label: id, value: "Not disclosed", classification: "Missing Evidence",
            sourceUrl: null, sourceUrls: [], claimPassage: "No passage returned", coverageStatus: "searched-no-support",
          }])),
      };
      return new Response(JSON.stringify({ id: `offline-${packets.length}`, output: [{
        type: "message", content: [{ type: "output_text", text: JSON.stringify(research), annotations: [] }],
      }] }), { status: 200 });
    },
  });
  return { result, packets };
}

test("full synthetic grounding/document/category flow retains exactly one model-neutral reported date", async () => {
  const { result, packets } = await runOffline(quote);
  assert.ok(packets.length >= 2, JSON.stringify({
    calls: packets.length, outcome: result.researchOutcome,
    categories: result.researchAudit?.categories.map((category) => ({
      id: category.categoryId, state: category.state, failure: category.providerFailure,
      telemetry: category.categoryPromptTelemetry,
    })),
  }));
  assert.equal(result.reportedFindings.length, 1);
  const finding = result.reportedFindings[0];
  assert.equal(finding.exactQuotation, quote);
  assert.equal(finding.sourceUrl, permitUrl);
  assert.equal(finding.facilityScope, "DFW13");
  assert.equal(finding.identityScope, "scope-unconfirmed");
  assert.equal(finding.financialEligibility, "not-established");
  assert.equal(result.researchOutcome.reportedFindingCount, 1);
  assert.equal(result.evidence.filter((item) => item.eligibleForModel).length, 0);
  assert.equal(result.proposedInputs?.length ?? 0, 0);
  assert.equal(result.eligibleEvidence?.length ?? 0, 0);
  assert.deepEqual(result.acceptedModelInputs ?? [], []);
  assert.equal(result.researchOutcome.reasonCodes.includes("no-admitted-passage-text"), false);
  const parsed = parseResponse(result, project);
  assert.equal(parsed.reportedFindings.length, 1, "client transport preserves display-only findings");
  assert.equal(parsed.proposedInputs.length, 0);
  assert.deepEqual(parsed.acceptedModelInputs, []);
  assert.equal(parseReportedResearchFindings(JSON.parse(JSON.stringify(parsed.reportedFindings))).length, 1);
});

test("full synthetic flow discards a date quotation absent from the retrieved document", async () => {
  const { result, packets } = await runOffline("Estimated Start Date: 09/09/2030");
  assert.ok(packets.length >= 2);
  assert.deepEqual(result.reportedFindings, []);
  assert.equal(result.researchOutcome.reportedFindingCount, 0);
  assert.equal(result.researchOutcome.reasonCodes.includes("no-admitted-passage-text"), false);
});

test("reported builder verifies category passages, normalizes quotation marks/case, deduplicates and rejects placeholders", () => {
  const result = categoryResult();
  const before = structuredClone(result);
  assert.equal(buildReportedResearchFindings(project, [result, result]).length, 1);
  assert.deepEqual(result, before);
  for (const change of [
    { classification: "Missing Evidence" }, { value: "Not disclosed" }, { claimPassage: "Start Date" },
    { claimPassage: "A completely invented quotation" }, { sourceUrl: "https://records.example.gov/other", sourceUrls: [] },
  ]) assert.equal(buildReportedResearchFindings(project, [categoryResult({ ...reportedClaim, ...change })]).length, 0);
  assert.equal(buildReportedResearchFindings(project, [{ ...result, sources: [] }]).length, 0);
  const source = { ...permitSource, accessOutcome: { ...permitSource.accessOutcome, passage: `${permitPassage}\nThe application says “Estimated Start” for this building.` } };
  const normalized = categoryResult({ ...reportedClaim, claimPassage: 'the application says "estimated start" for this building.' }, source);
  assert.equal(buildReportedResearchFindings(project, [normalized]).length, 1);
  const eligible = [{ id: reportedClaim.id, eligibleForModel: true }];
  assert.equal(buildReportedResearchFindings(project, [result], eligible)[0].financialEligibility, "eligible-evidence-separately-established");
});

test("reported builder caps at forty and obtains exact identity only from shared passage resolution", () => {
  const results = Array.from({ length: 45 }, (_, index) => categoryResult({ ...reportedClaim, id: `fixture-${index}` }));
  assert.equal(buildReportedResearchFindings(project, results).length, 40);
  const exactProject = { name: "Project Zephyr", location: "Red Oak, Ellis County, Texas" };
  const passage = `Project Zephyr is located in Red Oak, Ellis County, Texas. ${quote}`;
  const exact = { ...permitSource, accessOutcome: { ...permitSource.accessOutcome, passage } };
  assert.equal(buildReportedResearchFindings(exactProject, [categoryResult(reportedClaim, exact)])[0].identityScope, "exact-project");
});

test("reported section renders collapsed exact quote, scope and source without financial controls; empty renders nothing", () => {
  const findings = buildReportedResearchFindings(project, [categoryResult()]);
  const html = renderToStaticMarkup(React.createElement(ReportedResearchFindings, { findings }));
  for (const value of ["Reported findings", quote, "Exact source passage", "Facility scope unconfirmed", "DFW13", permitUrl, "Not used in the financial model."]) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|<button|<input/);
  assert.equal(renderToStaticMarkup(React.createElement(ReportedResearchFindings, { findings: [] })), "");
  assert.equal(renderToStaticMarkup(React.createElement(ReportedResearchFindings, {})), "");
});