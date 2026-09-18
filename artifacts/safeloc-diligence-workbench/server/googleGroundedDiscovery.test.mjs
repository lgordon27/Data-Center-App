import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_GEMINI_API_BASE_URL,
  GOOGLE_GEMINI_DEFAULT_MODEL,
  GOOGLE_GEMINI_MODEL,
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
  assert.equal(body.tools.length, 1);
  assert.deepEqual(body.tools[0], { google_search: {} });
  assert.equal("responseMimeType" in body.generationConfig, false);
  assert.match(body.contents[0].parts[0].text, /project-identity/);
  assert.match(body.contents[0].parts[0].text, /must call Google Search/);
  assert.match(body.contents[0].parts[0].text, /Never invent a URL/);
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

test("normalizes grounding chunks and declared citations into deduplicated discovery candidates", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    candidates: [{
      content: { parts: [{ text: JSON.stringify({
        queries: ["Project Atlas Taylor County permit"],
        citations: [{
          url: "https://records.example/permit?utm_source=google",
          title: "Atlas permit record",
          publisher: "County",
          categoryIds: ["permitting-construction"],
          queries: ["Project Atlas permit"],
        }],
      }) }] },
      groundingMetadata: {
        webSearchQueries: ["Project Atlas Taylor County permit"],
        groundingChunks: [
          { web: { uri: "https://records.example/permit", title: "Atlas permit record" } },
          { web: { uri: "https://records.example/permit?utm_source=duplicate", title: "Atlas permit duplicate" } },
          { web: { uri: "https://utility.example/atlas-interconnect", title: "Atlas interconnection record" } },
        ],
      },
    }],
  });
  assert.equal(result.status, "completed");
  assert.equal(result.generatedSummaryIgnored, true);
  assert.deepEqual(result.queries, ["Project Atlas Taylor County permit"]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].url, "https://records.example/permit");
  assert.equal(result.candidates[0].discoveryOnly, true);
  assert.equal(result.candidates[0].claimCited, false);
  assert.equal(result.candidates[0].excerpt, "");
  assert.ok(result.candidates[0].referringQueries.includes("Project Atlas permit"));
  assert.equal(result.groundingMetadataPresent, true);
  assert.equal(result.groundingSearchExecuted, true);
  assert.equal(result.usableCitationMetadataPresent, true);
});

test("keeps a completed no-citation grounding response distinct from provider failure", async () => {
  let requestUrl = null;
  let requestInit = null;
  const result = await discoverGoogleGroundedProject({
    project,
    apiKey: "fixture-google-key",
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: "{\"queries\":[\"Project Atlas exact project\"]}" }] },
          groundingMetadata: { webSearchQueries: ["Project Atlas exact project"], groundingChunks: [] },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(requestUrl, `${GOOGLE_GEMINI_API_BASE_URL}/${GOOGLE_GEMINI_MODEL}:generateContent`);
  assert.equal(requestInit.headers["x-goog-api-key"], "fixture-google-key");
  assert.equal(result.status, "completed");
  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.queries, ["Project Atlas exact project"]);
  assert.equal(result.providerRequestCount, 1);
  assert.equal(result.groundingMetadataPresent, true);
  assert.equal(result.groundingSearchExecuted, true);
  assert.equal(result.usableCitationMetadataPresent, false);
});

test("accepts a realistic generateContent grounding response with executed queries and deduplicated URL citations", async () => {
  let transmittedUrl = null;
  let transmittedInit = null;
  const result = await discoverGoogleGroundedProject({
    project,
    apiKey: "fixture-google-key",
    prompt: GOOGLE_GROUNDED_PREFLIGHT_PROMPT,
    maxOutputTokens: 256,
    requireGrounding: true,
    fetchImpl: async (url, init) => {
      transmittedUrl = url;
      transmittedInit = init;
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: "The current official DataBank DFW page is cited below." }] },
          groundingMetadata: {
            webSearchQueries: ["DataBank DFW Dallas official data center current"],
            searchEntryPoint: { renderedContent: "<div>Google Search</div>" },
            groundingChunks: [
              { web: { uri: "https://www.databank.com/data-centers/dallas/", title: "Dallas Data Centers" } },
              { web: { uri: "https://www.databank.com/data-centers/dallas/?utm_source=google", title: "Dallas Data Centers" } },
            ],
            groundingSupports: [{
              segment: { startIndex: 0, endIndex: 46, text: "The current official DataBank DFW page is cited" },
              groundingChunkIndices: [0],
            }],
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(result.groundingMetadataPresent, true);
  assert.equal(result.groundingSearchExecuted, true);
  assert.deepEqual(result.queries, ["DataBank DFW Dallas official data center current"]);
  assert.equal(result.citationCount, 1);
  assert.equal(result.candidates[0].url, "https://www.databank.com/data-centers/dallas");
  assert.equal(result.providerAttempt.queryCount, 1);
  assert.equal(result.providerAttempt.citationCount, 1);
  assert.equal(result.providerAttempt.toolDeclarationTransmitted, true);

  const sanitized = sanitizeGoogleGroundedRequest(transmittedUrl, transmittedInit);
  assert.equal(sanitized.endpoint, `${GOOGLE_GEMINI_API_BASE_URL}/${GOOGLE_GEMINI_MODEL}:generateContent`);
  assert.deepEqual(sanitized.headers, {
    accept: "application/json",
    "content-type": "application/json",
  });
  assert.equal("x-goog-api-key" in sanitized.headers, false);
  assert.deepEqual(sanitized.body.tools, [{ google_search: {} }]);
  assert.equal(sanitized.body.generationConfig.maxOutputTokens, 256);
  assert.equal(sanitized.body.generationConfig.responseMimeType, undefined);
});

test("rejects HTTP 200 when no grounding metadata proves the tool executed", async () => {
  await assert.rejects(
    discoverGoogleGroundedProject({
      project,
      apiKey: "fixture-google-key",
      prompt: GOOGLE_GROUNDED_PREFLIGHT_PROMPT,
      maxOutputTokens: 256,
      requireGrounding: true,
      fetchImpl: async () => new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: "{\"queries\":[\"model-declared query\"],\"citations\":[{\"url\":\"https://invented.example\"}]}",
            }],
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    }),
    (error) => {
      assert.equal(error.name, "GoogleDiscoveryGroundingRequiredError");
      assert.equal(error.researchErrorType, "google-grounding-not-proven");
      assert.deepEqual(error.providerDiagnostic, { status: 200, reason: "missing-grounding-metadata" });
      assert.equal(error.providerAttempt.queryCount, 0);
      assert.equal(error.providerAttempt.citationCount, 0);
      assert.equal(error.providerAttempt.toolDeclarationTransmitted, true);
      return true;
    },
  );
});

test("rejects executed-query metadata with malformed or missing URL citations", () => {
  const result = parseGoogleGroundedDiscoveryResponse({
    candidates: [{
      content: { parts: [{ text: "{\"citations\":[{\"url\":\"https://invented.example\"}]}" }] },
      groundingMetadata: {
        webSearchQueries: ["Project Atlas current official filing"],
        groundingChunks: [
          { web: { uri: "not-a-public-url", title: "Malformed citation" } },
          { retrievedContext: { uri: "https://not-a-web-citation.example" } },
        ],
      },
    }],
  });
  assert.equal(result.groundingMetadataPresent, true);
  assert.equal(result.groundingSearchExecuted, true);
  assert.equal(result.citationCount, 0);
  assert.equal(result.candidates.length, 0);
  assert.throws(
    () => assertGoogleGroundedPreflightResult(result),
    (error) => error?.providerDiagnostic?.reason === "missing-usable-citation-metadata",
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