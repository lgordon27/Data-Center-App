import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveResearchModelConfig, RESEARCH_MODEL_CONFIG } from "./researchModelConfig.mjs";
import { researchProjectCacheKey, RESEARCH_CACHE_MODEL_VERSION } from "./researchProjectCache.mjs";
import { createResearchProviderGate, runValidatedResearch, RESEARCH_PROJECT_RESPONSE_SCHEMA } from "./researchProjectProxy.mjs";
import { parseResponse } from "../src/services/researchProjectService.ts";
import { project, permitSource, permitUrl, permitPassage } from "./fixtures/syntheticExaminationPermit.mjs";

test("research model defaults, valid reasoning efforts, fallback and model-specific limits", () => {
  const defaults = resolveResearchModelConfig({});
  assert.equal(defaults.model, "gpt-6.1-sol");
  assert.equal(defaults.reasoningEffort, "low");
  assert.equal(defaults.tokensPerMinute, 450_000);
  assert.equal(defaults.categoryOutputTokens, 12_000);
  assert.equal(defaults.projectOutputTokens, 24_000);
  for (const effort of ["low", "medium", "high"]) {
    assert.equal(resolveResearchModelConfig({ OPENAI_RESEARCH_REASONING_EFFORT: effort }).reasoningEffort, effort);
  }
  for (const effort of ["none", "minimal", "unknown", ""]) {
    assert.equal(resolveResearchModelConfig({ OPENAI_RESEARCH_REASONING_EFFORT: effort }).reasoningEffort, "low");
  }
  const old = resolveResearchModelConfig({ OPENAI_RESEARCH_MODEL: "gpt-4o" });
  assert.equal(old.model, "gpt-4o");
  assert.equal(old.reasoningEffort, null);
  assert.equal(old.tokensPerMinute, 30_000);
  assert.equal(old.categoryOutputTokens, 3_500);
  assert.equal(old.projectOutputTokens, 8_000);
  assert.equal(resolveResearchModelConfig({ OPENAI_TPM_LIMIT: "400000" }).tokensPerMinute, 400_000);
  assert.equal(resolveResearchModelConfig({ OPENAI_RESEARCH_MODEL: "gpt-4o", OPENAI_TPM_LIMIT: "25000" }).tokensPerMinute, 25_000);
  for (const invalid of ["bad", "0", "-10"]) {
    assert.equal(resolveResearchModelConfig({ OPENAI_TPM_LIMIT: invalid }).tokensPerMinute, 450_000);
  }
});

test("cache model version and actual cache key change with configured model and reasoning effort", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const read = (model, effort = "low") => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      'import { researchProjectCacheKey, RESEARCH_CACHE_MODEL_VERSION } from "./server/researchProjectCache.mjs"; console.log(JSON.stringify({version:RESEARCH_CACHE_MODEL_VERSION,key:researchProjectCacheKey({name:"Synthetic",location:"Texas"})}));'],
    { cwd, env: { ...process.env, OPENAI_RESEARCH_MODEL: model, OPENAI_RESEARCH_REASONING_EFFORT: effort }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const current = read("gpt-6.1-sol");
  assert.notEqual(current.key, read("gpt-4o").key);
  assert.notEqual(current.key, read("gpt-6.1-sol", "high").key);
  assert.notEqual(current.version, "gpt-4o");
  assert.equal(RESEARCH_CACHE_MODEL_VERSION, RESEARCH_MODEL_CONFIG.cacheModelVersion);
  assert.equal(researchProjectCacheKey(project).length, 64);
});

test("actual Responses request honors runtime model/effort overrides without sending rejected sampling or reasoning parameters", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const script = `
    import { researchProjectWithWebSearch } from "./server/researchProjectProxy.mjs";
    let request;
    try {
      await researchProjectWithWebSearch({name:"Synthetic",location:"Texas"}, "fake-test-key",
        async (url, init) => { request = JSON.parse(init.body); throw new Error("intentional-fake-stop"); },
        undefined, { webSearchEnabled: false });
    } catch (error) { if (error.message !== "intentional-fake-stop") throw error; }
    console.log(JSON.stringify(request));`;
  for (const [model, effort, expected] of [
    ["gpt-6.1-sol", "high", "high"], ["gpt-6.1-sol", "bad-value", "low"], ["gpt-4o", "high", null],
  ]) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd, env: { ...process.env, OPENAI_RESEARCH_MODEL: model, OPENAI_RESEARCH_REASONING_EFFORT: effort, OPENAI_TPM_LIMIT: "" },
      encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const request = JSON.parse(child.stdout);
    assert.equal(request.model, model);
    assert.deepEqual(request.reasoning, expected ? { effort: expected } : undefined);
    for (const name of ["temperature", "top_p", "max_tokens"]) assert.equal(name in request, false);
    assert.deepEqual(request.text.format.schema, RESEARCH_PROJECT_RESPONSE_SCHEMA);
  }
});

test("fake 8-category provider admits all eight 8500-token reservations at new TPM instead of three", async () => {
  for (const [model, expected] of [["gpt-4o", 3], ["gpt-6.1-sol", 8]]) {
    const gate = createResearchProviderGate({ tokensPerMinute: resolveResearchModelConfig({ OPENAI_RESEARCH_MODEL: model }).tokensPerMinute });
    let issued = 0;
    let refused = 0;
    for (let category = 0; category < 8; category += 1) {
      try {
        await gate.run(async () => { issued += 1; return { provider: "fake", category }; }, {
          estimatedTokens: 8_500, deadlineAt: Date.now() + 5_000, minimumResponseMs: 1_000,
        });
      } catch (error) {
        assert.equal(error.researchErrorType, "provider-tpm-deadline");
        refused += 1;
      }
    }
    assert.equal(issued, expected);
    assert.equal(refused, 8 - expected);
    assert.equal(gate.snapshot().reservedTokensInWindow, issued * 8_500);
  }
});

const categoryIds = ["project-identity", "grid", "electricity", "water", "permitting-community",
  "construction-capital", "tenant-counterparty", "climate-operational-hazard"];

async function fakeRun({ outputLimited = 0, allowRetries = true, requestLimit = 16, allCategories = false, fallback = false } = {}) {
  const requests = [];
  const gate = createResearchProviderGate({ tokensPerMinute: 450_000 });
  const result = await runValidatedResearch(project, {
    apiKey: "synthetic-provider-only", googleApiKey: "synthetic-discovery-only",
    req: { ip: "198.51.100.60" }, rateLimiter: { allow: () => ({ allowed: true }) },
    providerGate: gate, allowGoogleFallback: fallback, allowCorrectiveRetries: false,
    allowProviderRetries: allowRetries, useDefaultSecConnector: false, secConnector: null,
    categoryIds: allCategories ? categoryIds : ["permitting-community"],
    researchTimeoutMs: 12_000, analysisReserveMs: 0,
    researchBudgetOverrides: { maxFollowUps: 0, maxFollowUpsPerCategory: 0, maxProviderRequests: requestLimit },
    googleDiscoveryImpl: async () => {
      if (fallback) throw new Error("synthetic-discovery-failure");
      return {
        status: "completed", provider: "synthetic-grounding", model: "offline",
        queries: [], providerRequestCount: 1,
        candidates: [{ ...permitSource, categoryIds, categoryRoutingUnknown: false, accessOutcome: undefined }],
      };
    },
    dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
    documentFetchImpl: async (url) => {
      assert.equal(url, permitUrl);
      return new Response(`<html><body>${permitPassage.split("\n").map((line) => `<p>${line}</p>`).join("")}</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } });
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body);
      requests.push(body);
      assert.equal(body.model, RESEARCH_MODEL_CONFIG.model);
      assert.deepEqual(body.reasoning, { effort: RESEARCH_MODEL_CONFIG.reasoningEffort });
      for (const parameter of ["temperature", "top_p", "max_tokens"]) assert.equal(parameter in body, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      const schema = body.text.format.schema;
      const summary = { name: project.name, location: project.location, description: "Synthetic result", capacityMW: null };
      const research = schema.properties.identityAssessment ? {
        projectSummary: summary,
        identityAssessment: { exactProjectIdentityEstablished: false, matchedName: null, matchedLocation: null, matchedOperator: null, reason: "Synthetic record names only a building." },
      } : {
        projectSummary: summary,
        evidence: Object.fromEntries(Object.keys(schema.properties.evidence.properties).map((id) => [id, {
          id, label: id, value: "Not disclosed", unit: "Project context", classification: "Missing Evidence",
          citation: "No evidence", description: "Synthetic missing-evidence result",
          sourceRole: "Synthetic source", sourceUrl: null, sourceUrls: [], conflictSummary: null,
          coverageStatus: "searched-no-support", modelReportedConfidence: null, sourceSupportConfidence: 0,
          claimPassage: "No passage returned", facilityScope: "unknown", phaseScope: "unknown",
          claimTimePeriod: null, numericValue: null, qualitativeValue: null,
        }])),
      };
      // Even valid-looking complete JSON must never be parsed when the provider
      // says generation stopped at its output limit.
      return new Response(JSON.stringify({
        id: `synthetic-${requests.length}`,
        ...(requests.length <= outputLimited ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } : { status: "completed" }),
        usage: { input_tokens: 500, output_tokens: 400, total_tokens: 900 },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(research), annotations: [] }] }],
      }), { status: 200 });
    },
  });
  return { result, requests, gate };
}

test("actual structured fake run issues all eight categories with reasoning, same evidence schema and auditable model", async () => {
  const { result, requests, gate } = await fakeRun({ allCategories: true });
  assert.equal(requests.length, 8);
  assert.ok(requests.every((body) => body.max_output_tokens === 12_000));
  for (const body of requests.filter((body) => body.text.format.schema.properties.evidence)) {
    const schema = body.text.format.schema;
    assert.equal(schema.properties.evidence.additionalProperties, false);
    for (const [id, record] of Object.entries(schema.properties.evidence.properties)) {
      assert.deepEqual(record, RESEARCH_PROJECT_RESPONSE_SCHEMA.properties.evidence.properties[id]);
    }
    assert.deepEqual(schema.properties.projectSummary, RESEARCH_PROJECT_RESPONSE_SCHEMA.properties.projectSummary);
  }
  assert.equal(result.researchAudit.model, RESEARCH_MODEL_CONFIG.model);
  assert.equal(result.researchAudit.reasoningEffort, "low");
  const attempts = result.researchAudit.categories.flatMap((row) => row.providerAttempts);
  assert.equal(attempts.filter((attempt) => attempt.issuedAt).length, 8);
  assert.ok(attempts.every((attempt) => attempt.model === RESEARCH_MODEL_CONFIG.model && attempt.reasoningEffort === "low"));
  const client = parseResponse(result, project);
  assert.equal(client.researchAudit.reasoningEffort, "low");
  assert.ok(client.researchAudit.categories.flatMap((row) => row.providerAttempts).every((attempt) => attempt.model === RESEARCH_MODEL_CONFIG.model && attempt.reasoningEffort === "low"));
  assert.ok(gate.snapshot().reservedTokensInWindow < 450_000);
});

test("output-limit incomplete response retries once with double budget and preserves limitation receipt", async () => {
  const { result, requests } = await fakeRun({ outputLimited: 1 });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].max_output_tokens, requests[0].max_output_tokens * 2);
  const attempts = result.researchAudit.categories.flatMap((row) => row.providerAttempts);
  assert.ok(attempts.some((attempt) => attempt.failureClassification === "provider-output-limit" && attempt.retryable === true));
  assert.ok(attempts.some((attempt) => attempt.retryCount === 1 && attempt.outcome === "completed"));
});

test("full-project fallback preserves the failed attempt and raises only its bounded output allowance on retry", async () => {
  const { result, requests } = await fakeRun({ fallback: true, outputLimited: 1 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_output_tokens, 24_000);
  assert.equal(requests[1].max_output_tokens, 48_000);
  assert.deepEqual(requests[0].text.format.schema, RESEARCH_PROJECT_RESPONSE_SCHEMA);
  assert.deepEqual(requests[1].text.format.schema, RESEARCH_PROJECT_RESPONSE_SCHEMA);
  assert.ok(result.researchAudit.providerAttempts.some((attempt) =>
    attempt.failureClassification === "provider-output-limit" && attempt.retryable));
});

test("output-limit failure remains technical, never empty success, when retries disabled or request budget exhausted", async () => {
  for (const options of [{ allowRetries: false }, { requestLimit: 2 }, {}]) {
    const { result, requests } = await fakeRun({ outputLimited: 10, ...options });
    assert.equal(requests.length, Object.keys(options).length ? 1 : 2);
    assert.equal(result.researchOutcome.state, "incomplete-technical-limitation");
    assert.ok(result.researchAudit.categories.some((row) => row.providerFailureType === "provider-output-limit"));
    assert.ok(result.researchAudit.categories.flatMap((row) => row.providerAttempts).some((attempt) => attempt.retryable === true));
    const client = parseResponse(result, project);
    assert.ok(client.researchAudit.categories.some((row) => row.providerFailureType === "provider-output-limit"));
    assert.ok(client.researchAudit.categories.flatMap((row) => row.providerAttempts).some((attempt) =>
      attempt.failureClassification === "provider-output-limit" && attempt.finishReason === "max_output_tokens" && attempt.retryable));
  }
});
