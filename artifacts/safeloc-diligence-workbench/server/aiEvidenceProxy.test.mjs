import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_EVIDENCE_MAX_TOKENS,
  AI_EVIDENCE_MODEL,
  AI_EVIDENCE_RATE_LIMIT_MESSAGE,
  AI_EVIDENCE_SYSTEM_PROMPT,
  OPENAI_CHAT_COMPLETIONS_URL,
  buildAIEvidencePrompt,
  buildAIEvidenceSystemPrompt,
  createAIEvidenceRateLimiter,
  handleAnalyzeEvidenceRequest,
} from "./aiEvidenceProxy.mjs";
import {
  AI_EVIDENCE_CUTOFF_LABEL,
  AI_EVIDENCE_REPORTING_WINDOW,
  AI_EVIDENCE_TEMPORAL_CONFIG,
} from "../src/data/aiEvidenceTemporal.mjs";

const evidence = {
  name: "Annual Cooling Water",
  value: "Not disclosed",
  source: "No public disclosure as of Aug 2026",
  projectName: "Stargate Abilene",
  projectLocation: "Taylor County, Texas",
  projectKind: "curated",
};

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

function requestWithBody(body, method = "POST", ip = "198.51.100.10") {
  return { method, body, ip };
}

test("returns the exact missing-key response without calling OpenAI", async () => {
  const response = responseRecorder();
  let calls = 0;
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    apiKey: "",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not be called");
    },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "AI analysis not configured. Set OPENAI_API_KEY in environment.",
  });
  assert.equal(calls, 0);
});

test("sends the exact OpenAI contract and returns parsed assessment JSON", async () => {
  const response = responseRecorder();
  let requestUrl;
  let requestInit;
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              classification: "Missing Evidence",
              reasoning: "The project has not publicly disclosed a facility-level water total.",
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    classification: "Missing Evidence",
    reasoning: "The project has not publicly disclosed a facility-level water total.",
  });
  assert.equal(requestUrl, OPENAI_CHAT_COMPLETIONS_URL);
  assert.equal(requestInit.method, "POST");
  assert.equal(requestInit.headers.authorization, "Bearer server-secret-for-test");
  assert.equal(requestInit.headers["content-type"], "application/json");
  assert.equal(requestInit.headers.accept, "application/json");
  const body = JSON.parse(requestInit.body);
  assert.deepEqual(body, {
    model: AI_EVIDENCE_MODEL,
    max_tokens: AI_EVIDENCE_MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildAIEvidenceSystemPrompt(evidence) },
      { role: "user", content: buildAIEvidencePrompt(evidence) },
    ],
  });
});

test("grounds the system instruction in the shared temporal contract", () => {
  assert.equal(AI_EVIDENCE_TEMPORAL_CONFIG.cutoffDate, "2026-08-30");
  assert.deepEqual(AI_EVIDENCE_TEMPORAL_CONFIG.validReportingYears, [2025, 2026]);
  assert.equal(AI_EVIDENCE_CUTOFF_LABEL, "August 30, 2026");
  assert.equal(AI_EVIDENCE_REPORTING_WINDOW, "2025–2026");
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, new RegExp(`Today is ${AI_EVIDENCE_CUTOFF_LABEL}`));
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, new RegExp(`active reporting window is ${AI_EVIDENCE_REPORTING_WINDOW}`));
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, /2025 and 2026 reporting as valid/i);
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, /Stargate Abilene data center project/i);
  for (const event of AI_EVIDENCE_TEMPORAL_CONFIG.temporalRecord) {
    assert.match(AI_EVIDENCE_SYSTEM_PROMPT, new RegExp(event.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, /exactly two JSON fields/i);
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, /and no others/i);
  assert.match(AI_EVIDENCE_SYSTEM_PROMPT, /reasoning \(one sentence explaining why\)/i);
});

test("keeps custom-project assessments separate from the curated Stargate record", () => {
  const customEvidence = {
    ...evidence,
    projectName: "QTS Irving 1",
    projectLocation: "Irving, Dallas County, Texas",
    projectKind: "custom",
  };
  const systemPrompt = buildAIEvidenceSystemPrompt(customEvidence);
  const userPrompt = buildAIEvidencePrompt(customEvidence);
  assert.match(systemPrompt, /assess only the supplied evidence value and citation/i);
  assert.match(systemPrompt, /do not apply facts or events from the curated Stargate Abilene record/i);
  assert.doesNotMatch(systemPrompt, /expansion was cancelled|winter storms damaged cooling equipment/i);
  assert.match(userPrompt, /QTS Irving 1/);
  assert.match(userPrompt, /Irving, Dallas County, Texas/);
  assert.match(userPrompt, /this exact project/i);
});

test("preserves upstream status without leaking provider error details", async () => {
  const response = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: "provider-internal detail server-secret-for-test" },
    }), { status: 429, headers: { "content-type": "application/json" } }),
  });

  assert.equal(response.statusCode, 429);
  assert.deepEqual(response.json(), {
    error: "AI analysis unavailable. Please classify manually.",
  });
  assert.doesNotMatch(response.body, /server-secret-for-test/);
  assert.doesNotMatch(response.body, /provider-internal detail/);
});

test("bounds requests per client and returns a safe manual-review fallback", async () => {
  let now = 100_000;
  const rateLimiter = createAIEvidenceRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => now,
  });
  let calls = 0;
  const options = {
    apiKey: "server-secret-for-test",
    rateLimiter,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          classification: "Missing Evidence",
          reasoning: "The project has not publicly disclosed a facility-level water total.",
        }) } }],
      }), { status: 200 });
    },
  };

  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), responseRecorder(), options);
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), responseRecorder(), options);
  const limitedResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), limitedResponse, options);

  assert.equal(calls, 2);
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.headers["retry-after"], "60");
  assert.deepEqual(limitedResponse.json(), { error: AI_EVIDENCE_RATE_LIMIT_MESSAGE });
  assert.doesNotMatch(limitedResponse.body, /server-secret-for-test|provider/i);

  const otherClientResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence, "POST", "198.51.100.11"), otherClientResponse, options);
  assert.equal(otherClientResponse.statusCode, 200);
  assert.equal(calls, 3);

  now += 60_000;
  const resetResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), resetResponse, options);
  assert.equal(resetResponse.statusCode, 200);
  assert.equal(calls, 4);
});

test("rejects methods and malformed evidence before an upstream request", async () => {
  const methodResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence, "GET"), methodResponse, {
    apiKey: "server-secret-for-test",
  });
  assert.equal(methodResponse.statusCode, 405);

  const invalidResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody({ ...evidence, source: "" }), invalidResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(invalidResponse.statusCode, 400);

  const invalidProjectResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody({ ...evidence, projectKind: "unknown" }), invalidProjectResponse, {
    apiKey: "server-secret-for-test",
    fetchImpl: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(invalidProjectResponse.statusCode, 400);
});