import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_GEMINI_API_BASE_URL,
  GOOGLE_GEMINI_MODEL,
  buildGoogleGroundedDiscoveryRequestBody,
  discoverGoogleGroundedProject,
  parseGoogleGroundedDiscoveryResponse,
} from "./googleGroundedDiscovery.mjs";
import { runValidatedResearch } from "./researchProjectProxy.mjs";

const project = {
  name: "Project Atlas",
  location: "Taylor County, Texas",
  knownData: { operator: "Atlas Compute", aliases: ["Atlas"] },
};

test("builds one Google Search grounding request without embedding generated evidence", () => {
  const body = buildGoogleGroundedDiscoveryRequestBody(project);
  assert.equal(body.tools.length, 1);
  assert.deepEqual(body.tools[0], { google_search: {} });
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.match(body.contents[0].parts[0].text, /project-identity/);
  assert.match(body.contents[0].parts[0].text, /Never invent a URL/);
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