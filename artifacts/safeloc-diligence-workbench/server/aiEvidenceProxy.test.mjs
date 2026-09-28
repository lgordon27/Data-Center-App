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
const allowedControls = {
  rateLimiter: { allow: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
  spendGuard: {
    reserve: async () => ({ allowed: true, reservation: { day: "2026-09-28", amount: 1, model: AI_EVIDENCE_MODEL } }),
    record: async (_reservation, usage) => {
      assert.deepEqual(usage, { prompt_tokens: 100, completion_tokens: 20 });
    },
    recordReserved: async () => {},
    release: async () => {},
  },
};

function createMemorySpendGuard(cap = 1, reservationAmount = 1) {
  let spent = 0;
  let reserved = 0;
  return {
    guard: {
      reserve: async () => {
        if (spent + reserved + reservationAmount > cap) return { allowed: false };
        reserved += reservationAmount;
        return {
          allowed: true,
          reservation: { day: "2026-09-28", amount: reservationAmount, model: AI_EVIDENCE_MODEL },
        };
      },
      record: async (reservation, usage) => {
        reserved -= reservation.amount;
        spent += Math.ceil((usage.prompt_tokens + usage.completion_tokens) / 100);
      },
      recordReserved: async (reservation) => {
        reserved -= reservation.amount;
        spent += reservation.amount;
      },
      release: async (reservation) => {
        reserved -= reservation.amount;
      },
    },
    totals: () => ({ spent, reserved }),
  };
}

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
    ...allowedControls,
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
    ...allowedControls,
    apiKey: "server-secret-for-test",
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return new Response(JSON.stringify({
        usage: { prompt_tokens: 100, completion_tokens: 20 },
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
  const accounting = createMemorySpendGuard();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    ...allowedControls,
    spendGuard: accounting.guard,
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
  assert.deepEqual(accounting.totals(), { spent: 0, reserved: 0 });
});

test("releases explicit provider errors so repeated rejections do not exhaust the spend cap", async () => {
  const accounting = createMemorySpendGuard(1);
  let calls = 0;
  for (let index = 0; index < 4; index += 1) {
    const response = responseRecorder();
    await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
      ...allowedControls,
      spendGuard: accounting.guard,
      apiKey: "server-secret-for-test",
      fetchImpl: async () => {
        calls += 1;
        return new Response("provider rejection", { status: 429 });
      },
    });
    assert.equal(response.statusCode, 429);
  }
  assert.equal(calls, 4);
  assert.deepEqual(accounting.totals(), { spent: 0, reserved: 0 });
});

test("releases reservations when local request setup fails before invoking the provider", async () => {
  const accounting = createMemorySpendGuard();
  const response = responseRecorder();
  let calls = 0;
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    ...allowedControls,
    spendGuard: accounting.guard,
    apiKey: "server-secret-for-test",
    createAbortController: () => { throw new Error("private setup detail"); },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be invoked");
    },
  });
  assert.equal(response.statusCode, 502);
  assert.equal(calls, 0);
  assert.deepEqual(accounting.totals(), { spent: 0, reserved: 0 });
});

test("charges the full reservation when the provider request outcome is ambiguous", async () => {
  const accounting = createMemorySpendGuard();
  const response = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    ...allowedControls,
    spendGuard: accounting.guard,
    apiKey: "server-secret-for-test",
    fetchImpl: async () => { throw new Error("network failure"); },
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(accounting.totals(), { spent: 1, reserved: 0 });
});

test("charges the full reservation when a successful response has no usable usage", async () => {
  const accounting = createMemorySpendGuard();
  const response = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    ...allowedControls,
    spendGuard: accounting.guard,
    apiKey: "server-secret-for-test",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        classification: "Missing Evidence",
        reasoning: "The citation does not establish the supplied value.",
      }) } }],
    }), { status: 200 }),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(accounting.totals(), { spent: 1, reserved: 0 });
});

test("records actual usage on success and safely logs settlement failures", async () => {
  const accounting = createMemorySpendGuard(10, 10);
  const response = responseRecorder();
  let logMessage = "";
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), response, {
    ...allowedControls,
    spendGuard: accounting.guard,
    apiKey: "server-secret-for-test",
    logger: { error: (message) => { logMessage += message; } },
    fetchImpl: async () => new Response(JSON.stringify({
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      choices: [{ message: { content: JSON.stringify({
        classification: "Missing Evidence",
        reasoning: "The citation does not establish the supplied value.",
      }) } }],
    }), { status: 200 }),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(accounting.totals(), { spent: 2, reserved: 0 });
  assert.equal(logMessage, "");

  const failedRecord = createMemorySpendGuard();
  const recordResponse = responseRecorder();
  const safeLogs = [];
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), recordResponse, {
    ...allowedControls,
    spendGuard: {
      ...failedRecord.guard,
      record: async () => { throw new Error("provider payload and secret"); },
    },
    apiKey: "server-secret-for-test",
    logger: { error: (message) => safeLogs.push(message) },
    fetchImpl: async () => new Response(JSON.stringify({
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      choices: [{ message: { content: JSON.stringify({
        classification: "Missing Evidence",
        reasoning: "The citation does not establish the supplied value.",
      }) } }],
    }), { status: 200 }),
  });
  assert.equal(recordResponse.statusCode, 200);
  assert.deepEqual(failedRecord.totals(), { spent: 0, reserved: 1 });
  assert.deepEqual(safeLogs, ["AI evidence spend usage recording failed."]);

  const failedRelease = createMemorySpendGuard();
  const errorResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), errorResponse, {
    ...allowedControls,
    spendGuard: {
      ...failedRelease.guard,
      release: async () => { throw new Error("provider error detail and secret"); },
    },
    apiKey: "server-secret-for-test",
    logger: { error: (message) => safeLogs.push(message) },
    fetchImpl: async () => new Response("provider error detail", { status: 503 }),
  });
  assert.equal(errorResponse.statusCode, 503);
  assert.deepEqual(failedRelease.totals(), { spent: 0, reserved: 1 });
  assert.equal(safeLogs.at(-1), "AI evidence spend release failed.");
  assert.doesNotMatch(safeLogs.join(" "), /provider|secret|payload/i);
});

test("returns safe limit and capacity responses without paid calls", async () => {
  let calls = 0;
  const options = {
    ...allowedControls,
    apiKey: "server-secret-for-test",
    rateLimiter: { allow: async () => ({ allowed: false, retryAfterSeconds: 37 }) },
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

  const limitedResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), limitedResponse, options);

  assert.equal(calls, 0);
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.headers["retry-after"], "37");
  assert.deepEqual(limitedResponse.json(), { error: AI_EVIDENCE_RATE_LIMIT_MESSAGE });
  assert.doesNotMatch(limitedResponse.body, /server-secret-for-test|provider/i);

  const capacityResponse = responseRecorder();
  await handleAnalyzeEvidenceRequest(requestWithBody(evidence), capacityResponse, {
    ...options,
    rateLimiter: allowedControls.rateLimiter,
    spendGuard: { reserve: async () => ({ allowed: false }) },
  });
  assert.equal(capacityResponse.statusCode, 429);
  assert.deepEqual(capacityResponse.json(), {
    error: "Daily research capacity reached. Please try again tomorrow.",
  });
  assert.equal(calls, 0);
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