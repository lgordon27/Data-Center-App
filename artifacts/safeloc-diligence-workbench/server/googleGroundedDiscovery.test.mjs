import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_GEMINI_DEFAULT_MODEL,
  GOOGLE_GEMINI_INTERACTIONS_URL,
  GOOGLE_GEMINI_MODEL,
  GOOGLE_DISCOVERY_CATEGORY_ROUTING,
  GOOGLE_GROUNDED_PREFLIGHT_PROMPT,
  assertGoogleGroundedPreflightResult,
  buildGoogleGroundedDiscoveryRequestBody,
  discoverGoogleGroundedProject,
  parseGoogleGroundedDiscoveryResponse,
  resolveGoogleGeminiModel,
  sanitizeGoogleGroundedRequest,
} from "./googleGroundedDiscovery.mjs";
import { runValidatedResearch } from "./researchProjectProxy.mjs";

const project = {
  name: "Project Atlas",
  location: "Taylor County, Texas",
  knownData: { operator: "Atlas Compute", aliases: ["Atlas"] },
};

test("uses the supported default model when GEMINI_DISCOVERY_MODEL is absent", () => {
  assert.equal(GOOGLE_GEMINI_DEFAULT_MODEL, "gemini-3.8-flash");
  assert.equal(resolveGoogleGeminiModel({}), GOOGLE_GEMINI_DEFAULT_MODEL);
  assert.equal(GOOGLE_GEMINI_MODEL, GOOGLE_GEMINI_DEFAULT_MODEL);
});

test("honors a configured supported GEMINI_DISCOVERY_MODEL", () => {
  assert.equal(
    resolveGoogleGeminiModel({ GEMINI_DISCOVERY_MODEL: "  gemini-3.8-flash  " }),
    "gemini-3.8-flash",
  );
});

test("builds one Google Search grounding request without embedding generated evidence", () => {
  const body = buildGoogleGroundedDiscoveryRequestBody(project);
  assert.equal(body.model, GOOGLE_GEMINI_MODEL);
  assert.deepEqual(body.tools, [{ type: "google_search" }]);
  assert.equal("contents" in body, false);
  assert.equal("generationConfig" in body, false);
  assert.match(body.input, /project-identity/);
  assert.match(body.input, /must call Google Search/);
  assert.match(body.input, /Never invent a URL/);
});

test("classifies an unavailable model before any grounding query executes", async () => {
  await assert.rejects(
    discoverGoogleGroundedProject({
      project,
      apiKey: "fixture-google-key",
      model: "gemini-obsolete",
      fetchImpl: async () => new Response(JSON.stringify({
        error: {
          code: 404,
          status: "NOT_FOUND",
          message: "The requested model is not available.",
        },
      }), { status: 404, headers: { "content-type": "application/json" } }),
    }),
    (error) => {
      assert.equal(error.name, "GoogleDiscoveryProviderError");
      assert.equal(error.researchErrorType, "google-model-unavailable");
      assert.deepEqual(error.providerDiagnostic, { status: 404, reason: "NOT_FOUND" });
      assert.equal(error.providerAttempt.model, "gemini-obsolete");
      assert.equal(error.providerAttempt.requestCount, 1);
      assert.equal(error.providerAttempt.queryCount, 0);
      assert.equal(error.providerAttempt.citationCount, 0);
      return true;
    },
  );
});

test("parses successful Interactions search steps and deduplicates URL-citation annotations", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      {
        type: "google_search_call",
        arguments: { queries: ["Project Atlas Taylor County permit"] },
      },
      {
        type: "google_search_result",
        result: { searchSuggestions: "<div>Google Search</div>" },
      },
      {
        type: "model_output",
        content: [{
          type: "text",
          text: "Current sources are cited.",
          annotations: [
            { type: "url_citation", url: "https://records.example/permit", title: "Atlas permit record" },
            { type: "url_citation", url: "https://records.example/permit?utm_source=duplicate", title: "Duplicate" },
            { type: "url_citation", url: "https://utility.example/atlas-interconnect", title: "Atlas interconnection record" },
          ],
        }],
      },
    ],
  });
  assert.equal(result.status, "completed");
  assert.equal(result.generatedSummaryIgnored, true);
  assert.deepEqual(result.queries, ["Project Atlas Taylor County permit"]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].url, "https://records.example/permit");
  assert.equal(result.candidates[0].discoveryOnly, true);
  assert.equal(result.candidates[0].claimCited, false);
  assert.equal(result.candidates[0].excerpt, "");
  assert.ok(result.candidates[0].referringQueries.includes("Project Atlas Taylor County permit"));
  assert.equal(result.groundingMetadataPresent, true);
  assert.equal(result.groundingSearchExecuted, true);
  assert.equal(result.usableCitationMetadataPresent, true);
  assert.equal(result.googleSearchCallCount, 1);
  assert.equal(result.googleSearchResultCount, 1);
  assert.equal(result.urlCitationCount, 3);
  assert.equal(result.citationCount, 2);
});

test("maps discovery labels to every downstream category without positional assignment", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["grid and power"] } },
      { type: "google_search_result", result: {} },
      {
        type: "model_output",
        content: [{
          type: "text",
          annotations: [{
            type: "url_citation",
            url: "https://records.example/grid",
            categoryIds: ["grid-power"],
          }],
        }],
      },
    ],
  });
  assert.deepEqual(result.candidates[0].categoryIds, ["grid", "electricity"]);
  assert.deepEqual(GOOGLE_DISCOVERY_CATEGORY_ROUTING["grid-power"], ["grid", "electricity"]);
});

test("keeps unknown discovery labels available for relevance but never marks them applicable", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["unclassified source"] } },
      { type: "google_search_result", result: {} },
      {
        type: "model_output",
        content: [{
          type: "text",
          annotations: [{
            type: "url_citation",
            url: "https://records.example/unknown",
            categoryIds: ["new-provider-label"],
          }],
        }],
      },
    ],
  });
  assert.deepEqual(result.candidates[0].categoryIds, []);
  assert.deepEqual(result.candidates[0].unknownCategoryLabels, ["new-provider-label"]);
  assert.equal(result.candidates[0].categoryRoutingUnknown, true);
});

test("transmits the documented Interactions request and captures it without secrets", async () => {
  let transmittedUrl = null;
  let transmittedInit = null;
  const result = await discoverGoogleGroundedProject({
    project,
    apiKey: "fixture-google-key",
    prompt: GOOGLE_GROUNDED_PREFLIGHT_PROMPT,
    requireGrounding: true,
    fetchImpl: async (url, init) => {
      transmittedUrl = url;
      transmittedInit = init;
      return new Response(JSON.stringify({
        steps: [
          { type: "google_search_call", arguments: { queries: ["Google Gemini grounding docs last updated"] } },
          { type: "google_search_result", result: { searchSuggestions: "Google Search" } },
          {
            type: "model_output",
            content: [{
              type: "text",
              text: "The documentation is cited.",
              annotations: [{
                type: "url_citation",
                url: "https://ai.google.dev/gemini-api/docs/google-search",
                title: "Grounding with Google Search",
              }],
            }],
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.citationCount, 1);
  assert.equal(result.providerAttempt.queryCount, 1);
  assert.equal(result.providerAttempt.citationCount, 1);
  assert.equal(result.providerAttempt.toolDeclarationTransmitted, true);

  const sanitized = sanitizeGoogleGroundedRequest(transmittedUrl, transmittedInit);
  assert.equal(sanitized.endpoint, GOOGLE_GEMINI_INTERACTIONS_URL);
  assert.deepEqual(sanitized.headers, {
    accept: "application/json",
    "content-type": "application/json",
  });
  assert.equal("x-goog-api-key" in sanitized.headers, false);
  assert.equal(JSON.stringify(sanitized).includes("fixture-google-key"), false);
  assert.equal(sanitized.body.model, GOOGLE_GEMINI_MODEL);
  assert.equal(sanitized.body.input, GOOGLE_GROUNDED_PREFLIGHT_PROMPT.replace(/\s+/g, " ").trim());
  assert.deepEqual(sanitized.body.tools, [{ type: "google_search" }]);
});

const validCitationStep = {
  type: "model_output",
  content: [{
    type: "text",
    text: "Official source.",
    annotations: [{ type: "url_citation", url: "https://records.example/permit" }],
  }],
};

test("rejects HTTP 200 model output with no google_search_call", () => {
  const result = parseGoogleGroundedDiscoveryResponse({ steps: [validCitationStep] });
  assert.throws(
    () => assertGoogleGroundedPreflightResult(result),
    (error) => error?.providerDiagnostic?.reason === "missing-google-search-call",
  );
});

test("rejects a google_search_call with an empty executed-query array", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: [] } },
      { type: "google_search_result", result: {} },
      validCitationStep,
    ],
  });
  assert.throws(
    () => assertGoogleGroundedPreflightResult(result),
    (error) => error?.providerDiagnostic?.reason === "empty-executed-queries",
  );
});

test("rejects search-call proof without a google_search_result step", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["Project Atlas current permit"] } },
      validCitationStep,
    ],
  });
  assert.throws(
    () => assertGoogleGroundedPreflightResult(result),
    (error) => error?.providerDiagnostic?.reason === "missing-google-search-result",
  );
});

test("rejects completed search steps without a url_citation annotation", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["Project Atlas current permit"] } },
      { type: "google_search_result", result: { items: [] } },
      { type: "model_output", content: [{ type: "text", text: "No cited output.", annotations: [] }] },
    ],
  });
  assert.throws(
    () => assertGoogleGroundedPreflightResult(result),
    (error) => error?.providerDiagnostic?.reason === "missing-url-citations",
  );
});

test("does not let model prose or JSON manufacture queries or URL citations", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [{
      type: "model_output",
      content: [{
        type: "text",
        text: "{\"queries\":[\"fake query\"],\"citations\":[{\"url\":\"https://invented.example\"}]}",
      }],
    }],
  });
  assert.deepEqual(result.queries, []);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.googleSearchCallCount, 0);
  assert.equal(result.urlCitationCount, 0);
});

test("diagnoses unsafe, duplicate, and missing citation annotations without accepting them", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    steps: [
      { type: "google_search_call", arguments: { queries: ["fixture query"] } },
      { type: "google_search_result", result: {} },
      {
        type: "model_output",
        content: [{
          annotations: [
            { type: "url_citation", url: "https://records.example/item?utm_source=one", title: "Fixture" },
            { type: "url_citation", url: "https://records.example/item", title: "Duplicate" },
            { type: "url_citation", url: "file:///etc/passwd", title: "Unsafe" },
            { type: "url_citation", title: "Missing" },
          ],
        }],
      },
    ],
  });
  assert.deepEqual(result.acceptedCitationUrls, ["https://records.example/item"]);
  assert.deepEqual(result.rejectedCitationUrls.map((item) => item.reason), [
    "duplicate-canonical-url",
    "unsafe-or-invalid-url",
    "missing-url",
  ]);
  assert.equal(result.rawAnnotationSummaries.filter((item) => item.accepted).length, 1);
  assert.equal(result.citationCount, 1);
  assert.equal(result.urlCitationCount, 4);
});

test("does not issue structured category analysis when grounding has no retained passage", async () => {
  let openAiCalls = 0;
  const result = await runValidatedResearch({
    ...project,
    forceRefresh: true,
  }, {
    apiKey: "fixture-openai-key",
    googleApiKey: "fixture-google-key",
    googleDiscoveryImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        status: "completed",
        provider: "google-gemini-grounding",
        model: GOOGLE_GEMINI_MODEL,
        queries: ["Project Atlas exact project"],
        candidates: [],
        googleSearchCallCount: 1,
        googleSearchResultCount: 1,
        urlCitationCount: 0,
        citationCount: 0,
        providerRequestCount: 1,
      };
    },
    categoryIds: ["project-identity"],
    rateLimiter: { allow: () => ({ allowed: true }) },
    req: { ip: "198.51.100.22" },
    fetchImpl: async () => {
      openAiCalls += 1;
      throw new Error("Structured analysis must not run without a retained passage.");
    },
    documentFetchImpl: async () => {
      throw new Error("No cited document should be opened.");
    },
  });
  assert.equal(openAiCalls, 0);
  assert.equal(result.researchCoverage.discoveryCandidateCount, 0);
  assert.equal(result.researchOutcome.state, "incomplete-technical-limitation");
  assert.ok(result.researchCoverage.phaseTiming.discoveryElapsedMs >= 20);
  assert.ok(result.researchCoverage.phaseTiming.orchestrationBudgetMs < 90_000);
  assert.equal(result.researchCoverage.phaseTiming.analysisElapsedMs, 0);
});

test("rejects malformed Interactions steps distinctly", () => {
  assert.throws(
    () => parseGoogleGroundedDiscoveryResponse({ steps: { type: "model_output" } }),
    (error) => error?.providerDiagnostic?.reason === "malformed-interactions-response",
  );
});

test("runs one Google discovery request before structured extraction without OpenAI web tools", async () => {
  let openAiCalls = 0;
  let documentCalls = 0;
  const result = await runValidatedResearch({
    ...project,
    forceRefresh: true,
  }, {
    apiKey: "fixture-openai-key",
    googleApiKey: "fixture-google-key",
    googleDiscoveryImpl: async () => ({
      status: "completed",
      provider: "google-gemini-grounding",
      model: GOOGLE_GEMINI_MODEL,
      queries: ["Project Atlas exact project"],
      candidates: [{
        url: "https://records.example/project-atlas",
        title: "Project Atlas public filing",
        categoryIds: ["project-identity"],
        referringQueries: ["Project Atlas exact project"],
        sourceChannel: "google-grounded-search",
        origin: "google-grounded-search",
        discoveryOnly: true,
      }],
      providerRequestCount: 1,
      providerAttempt: { provider: "google-gemini-grounding", requestCount: 1, outcome: "completed" },
    }),
    categoryIds: ["project-identity"],
    rateLimiter: { allow: () => ({ allowed: true }) },
    req: { ip: "198.51.100.20" },
    fetchImpl: async (_url, init) => {
      openAiCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal("tools" in body, false);
      return new Response(JSON.stringify({
        id: "fixture-structured-response",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              projectSummary: {
                name: "Project Atlas",
                location: "Taylor County, Texas",
                description: "Project Atlas public filing.",
                capacityMW: null,
                capacityProvenance: "standardized-default",
              },
              identityAssessment: {
                exactProjectIdentityEstablished: true,
                matchedName: "Project Atlas",
                matchedLocation: "Taylor County, Texas",
                matchedOperator: "Atlas Compute",
                reason: "The supplied passage identifies the project.",
              },
            }),
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    documentFetchImpl: async () => {
      documentCalls += 1;
      return new Response("<html><body>Project Atlas public filing identifies the project.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(openAiCalls, 1);
  assert.equal(documentCalls, 1);
  assert.equal(result.researchCoverage.discoveryProvider, "google-gemini-grounding");
  assert.equal(result.researchCoverage.discoveryStatus, "completed");
  assert.equal(result.researchAudit.providerRequestCount, 2);
  assert.equal(result.researchAudit.providerAttempts[0].provider, "google-gemini-grounding");
  assert.equal(result.researchAudit.providerAttempts[0].outcome, "completed");
});

test("does not invoke OpenAI fallback when Gemini-only validation disables it", async () => {
  let openAiCalls = 0;
  const providerError = new Error("Google Gemini grounding returned an upstream failure.");
  providerError.name = "GoogleDiscoveryProviderError";
  providerError.researchErrorType = "google-model-unavailable";
  providerError.providerDiagnostic = { status: 404, reason: "NOT_FOUND" };
  providerError.providerAttempt = {
    provider: "google-gemini-grounding",
    model: "gemini-obsolete",
    requestCount: 1,
    status: 404,
    outcome: "failed",
    queryCount: 0,
    citationCount: 0,
  };

  const result = await runValidatedResearch({
    ...project,
    forceRefresh: true,
  }, {
    apiKey: "fixture-openai-key",
    googleApiKey: "fixture-google-key",
    googleDiscoveryImpl: async () => {
      throw providerError;
    },
    googleModel: "gemini-obsolete",
    allowGoogleFallback: false,
    categoryIds: ["project-identity"],
    rateLimiter: { allow: () => ({ allowed: true }) },
    req: { ip: "198.51.100.21" },
    fetchImpl: async () => {
      openAiCalls += 1;
      throw new Error("OpenAI fallback must not run.");
    },
    documentFetchImpl: async () => {
      throw new Error("No document should be opened without discovery candidates.");
    },
  });

  assert.equal(openAiCalls, 0);
  assert.equal(result.researchCoverage.discoveryStatus, "technical-failure");
  assert.equal(result.researchCoverage.fallbackProvider, null);
  assert.equal(result.researchCoverage.fallbackRequestCount, 0);
  assert.equal(result.researchAudit.providerAttempts[0].provider, "google-gemini-grounding");
  assert.equal(result.researchAudit.providerAttempts[0].requestCount, 1);
  assert.equal(result.researchAudit.providerAttempts[0].queryCount, 0);
  assert.equal(result.researchOutcome.state, "incomplete-technical-limitation");
});