import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportedResearchFindings } from "../src/components/ReportedResearchFindings.tsx";
import { parseReportedResearchFindings, parseResponse } from "../src/services/researchProjectService.ts";
import { createResearchProviderGate, runValidatedResearch, buildReportedResearchFindings } from "./researchProjectProxy.mjs";
import { project, permitUrl, permitPassage, permitSource } from "./fixtures/syntheticExaminationPermit.mjs";

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