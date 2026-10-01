import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Request, Response } from "express";
import { createResearchAdmissionHandler } from "./index.js";
import { createExclusiveResearchAdmission } from "./publicLimits.js";
import {
  handleResearchProjectRequest,
  parseResearchResponse,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_TIMEOUT_MS,
} from "./researchProjectProxy.mjs";
import { createResearchProjectCache } from "./researchProjectCache.mjs";

function createFakePool() {
  let locked = false;
  let acquireQueries = 0;
  let unlockQueries = 0;
  let releasedClients = 0;
  const pool = {
    async connect() {
      return {
        async query(sql: string) {
          if (sql.includes("pg_try_advisory_lock")) {
            acquireQueries += 1;
            const acquired = !locked;
            locked ||= acquired;
            return { rows: [{ acquired }], rowCount: 1 };
          }
          if (sql.includes("pg_advisory_unlock")) {
            unlockQueries += 1;
            const unlocked = locked;
            locked = false;
            return { rows: [{ unlocked }], rowCount: 1 };
          }
          throw new Error("Unexpected SQL in test.");
        },
        release() { releasedClients += 1; },
      };
    },
    async query() { throw new Error("Pool query is not used in this test."); },
  };
  return {
    pool,
    get locked() { return locked; },
    get acquireQueries() { return acquireQueries; },
    get unlockQueries() { return unlockQueries; },
    get releasedClients() { return releasedClients; },
  };
}

function responseStub() {
  return {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; this.headersSent = true; return this; },
  };
}

function productionResponseStub() {
  return {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    endCalls: 0,
    jsonCalls: 0,
    headers: new Map<string, string>(),
    status(code: number) { this.statusCode = code; return this; },
    setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); },
    json(body: unknown) {
      this.jsonCalls += 1;
      this.body = body;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    end(body?: string | Buffer) {
      this.endCalls += 1;
      this.body = body ?? "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
  };
}

function responseBody(response: ReturnType<typeof productionResponseStub>) {
  return typeof response.body === "string" ? JSON.parse(response.body) : response.body;
}

function validStaleResearchFixture() {
  const sourceUrl = "https://example.com/atlas/source";
  const claimPassage = "A public source excerpt about Project Atlas in Taylor County, Texas reports 42 and 365 and behind-the-meter generation.";
  const research = {
    projectSummary: {
      name: "Project Atlas",
      location: "Taylor County, Texas",
      description: "High-level public research covering equipment lead times, local rates, noise, moratoriums, and semiconductor supply.",
      capacityMW: 600,
    },
    evidence: RESEARCH_EVIDENCE_IDS.map((id: string, index: number) => ({
      id,
      label: id.replaceAll("_", " "),
      value: index === 0 ? 42 : "Not disclosed",
      unit: index === 0 ? "$/MWh" : "Project context",
      classification: index % 2 === 0 ? "Missing Evidence" : "Management Assertion",
      citation: `Public source searched for Project Atlas (2026): ${sourceUrl}`,
      description: "The public record does not establish a facility-level value.",
      sourceRole: "AI-researched public-source review",
      sourceUrls: index === 1 ? [sourceUrl] : [],
      conflictSummary: null,
      coverageStatus: index === 1 ? "supported" : "searched-no-support",
      modelReportedConfidence: index === 0 ? 74 : null,
      ...(index === 1 ? { sourceUrl } : {}),
      ...(index === 0 ? { numericValue: 42 } : {}),
      claimPassage,
      facilityScope: "exact-project",
      phaseScope: "exact-phase",
      claimTimePeriod: "2026",
      ...(id === "site_hazard_exposure" ? { qualitativeValue: "high" } : {}),
      ...(id === "water_source_resilience" ? { qualitativeValue: "single-source" } : {}),
    })),
  };
  const source = {
    url: sourceUrl,
    title: "Project Atlas public filing",
    date: "2026-06-01",
    excerpt: claimPassage,
    claimPassage,
    claimSupport: RESEARCH_EVIDENCE_IDS.map((evidenceId: string) => ({
      evidenceId,
      values: evidenceId === "electricity_cost" ? [42, "Not disclosed"]
        : evidenceId === "grid_interconnection" ? [365, "Not disclosed"]
          : ["Not disclosed"],
    })),
    facilityScope: "exact-project",
    phaseScope: "exact-phase",
    timePeriod: "2026",
  };
  return parseResearchResponse(research, [source]);
}

test("concurrent custom research is rejected before the provider handler runs", async () => {
  const fake = createFakePool();
  const admission = createExclusiveResearchAdmission(fake.pool as never);
  let providerInvocations = 0;
  let releaseFirst!: () => void;
  const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const handler = createResearchAdmissionHandler(admission, async () => {
    providerInvocations += 1;
    await held;
  });
  const firstResponse = responseStub();
  const first = handler({ method: "POST" } as Request, firstResponse as unknown as Response);
  while (providerInvocations === 0) await new Promise((resolve) => setImmediate(resolve));

  const secondResponse = responseStub();
  await handler({ method: "POST" } as Request, secondResponse as unknown as Response);
  assert.equal(providerInvocations, 1);
  assert.equal(secondResponse.statusCode, 503);
  assert.equal((secondResponse.body as { errorType?: string }).errorType, "research-capacity-busy");

  releaseFirst();
  await first;
  assert.equal(fake.acquireQueries, 2);
});

test("cached GET requests bypass provider admission", async () => {
  const fake = createFakePool();
  const admission = createExclusiveResearchAdmission(fake.pool as never);
  let handlerInvocations = 0;
  const handler = createResearchAdmissionHandler(admission, async (_request, response) => {
    handlerInvocations += 1;
    response.status(200).json({ researchCache: { refreshStatus: "completed" } });
  });
  const response = responseStub();
  await handler({ method: "GET" } as Request, response as unknown as Response);
  assert.equal(handlerInvocations, 1);
  assert.equal(fake.acquireQueries, 0);
});

test("cached reads do not initialize unavailable admission controls", async () => {
  let initialized = 0;
  let cachedReads = 0;
  const handler = createResearchAdmissionHandler(async () => {
    initialized += 1;
    throw new Error("Private database diagnostic");
  }, async () => { cachedReads += 1; });
  await handler({ method: "GET" } as Request, responseStub() as unknown as Response);
  assert.equal(initialized, 0);
  assert.equal(cachedReads, 1);
});

test("unavailable admission fails closed without invoking live work or leaking diagnostics", async () => {
  let liveCalls = 0;
  const handler = createResearchAdmissionHandler(async () => {
    throw new Error("Private database diagnostic");
  }, async () => { liveCalls += 1; });
  const response = responseStub();
  await handler({ method: "POST" } as Request, response as unknown as Response);
  assert.equal(liveCalls, 0);
  assert.equal(response.statusCode, 503);
  assert.equal((response.body as { errorType: string }).errorType, "research-admission-unavailable");
  assert.doesNotMatch(JSON.stringify(response.body), /Private database/);
});

test("handler errors release admission and return only a curated public failure", async () => {
  const fake = createFakePool();
  const admission = createExclusiveResearchAdmission(fake.pool as never);
  const handler = createResearchAdmissionHandler(admission, async () => {
    throw new Error("Private provider body and stack");
  });
  const response = responseStub();
  await handler({ method: "POST" } as Request, response as unknown as Response);
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /Private provider/);
  assert.equal(fake.releasedClients, 1);
  const next = await admission.acquire();
  assert.equal(next.admitted, true);
  if (next.admitted) await next.release();
});

test("a cancelled arrival releases admission without starting research", async () => {
  const fake = createFakePool();
  let liveCalls = 0;
  const handler = createResearchAdmissionHandler(createExclusiveResearchAdmission(fake.pool as never), async () => {
    liveCalls += 1;
  });
  await handler({ method: "POST", aborted: true } as Request, responseStub() as unknown as Response);
  assert.equal(liveCalls, 0);
  assert.equal(fake.releasedClients, 1);
});

test("background refresh admission has a bounded lease and idempotent release", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = createFakePool();
  const handler = createResearchAdmissionHandler(createExclusiveResearchAdmission(fake.pool as never), async (_request, response) => {
    response.json({ researchCache: { refreshStatus: "running" } });
  });
  await handler({ method: "POST" } as Request, responseStub() as unknown as Response);
  assert.equal(fake.releasedClients, 0);
  t.mock.timers.tick(110_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.releasedClients, 1);
  t.mock.timers.tick(110_000);
  assert.equal(fake.releasedClients, 1);
});

test("production stale-cache POST retains shared admission through a held refresh and the lease boundary", { timeout: 15_000 }, async (t) => {
  const baseTime = Date.parse("2026-09-01T00:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: baseTime });
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-research-admission-cache-"));
  let now = baseTime;
  const cache = createResearchProjectCache({ directory, now: () => now });
  const project = { name: "Project Atlas", location: "Taylor County, Texas" };
  const key = cache.keyFor(project);
  const fake = createFakePool();
  const admission = createExclusiveResearchAdmission(fake.pool as never);
  let handlerInvocations = 0;
  let providerInvocations = 0;
  let fetchInvocations = 0;
  let rateLimitChecks = 0;
  let providerAborted = false;
  let settleDiscovery!: () => void;
  let signalDiscoveryStarted!: () => void;
  const discoveryStarted = new Promise<void>((resolve) => { signalDiscoveryStarted = resolve; });
  const discoverySettled = new Promise<void>((resolve) => { settleDiscovery = resolve; });
  let releaseDiscovery!: () => void;

  try {
    await cache.write(key, validStaleResearchFixture());
    cache.clearMemory();
    now += 2 * 24 * 60 * 60 * 1000;
    const realHandler = async (request: Request, response: Response) => {
      handlerInvocations += 1;
      await handleResearchProjectRequest(request, response, {
        apiKey: "offline-test-provider-key",
        googleApiKey: "offline-test-google-key",
        cache,
        categoryIds: ["grid"],
        researchBudgetOverrides: { maxProviderRequests: 1 },
        allowGoogleFallback: false,
        allowCorrectiveRetries: false,
        allowProviderRetries: false,
        useDefaultSecConnector: false,
        registry: { retain: async () => {} },
        googleDiscoveryImpl: async ({ signal }: { signal?: AbortSignal }) => {
          providerInvocations += 1;
          signalDiscoveryStarted();
          return await new Promise((resolve, reject) => {
            const onAbort = () => {
              providerAborted = true;
              signal?.removeEventListener("abort", onAbort);
              settleDiscovery();
              const error = new Error("Offline discovery provider cancelled at the research deadline.");
              error.name = "AbortError";
              reject(error);
            };
            releaseDiscovery = () => {
              signal?.removeEventListener("abort", onAbort);
              settleDiscovery();
              resolve({ status: "completed", candidates: [], queries: [] });
            };
            if (signal?.aborted) onAbort();
            else signal?.addEventListener("abort", onAbort, { once: true });
          });
        },
        rateLimiter: {
          allow() {
            rateLimitChecks += 1;
            return { allowed: true, retryAfterSeconds: 0 };
          },
        },
        dnsLookup: async () => { throw new Error("Unexpected DNS resolution in offline admission regression."); },
        documentFetchImpl: async () => { throw new Error("Unexpected document fetch in offline admission regression."); },
        fetchImpl: async () => {
          fetchInvocations += 1;
          providerInvocations += 1;
          throw new Error("Unexpected OpenAI fetch in offline admission regression.");
        },
      });
    };
    const handler = createResearchAdmissionHandler(admission, realHandler);
    const firstResponse = productionResponseStub();
    const originalEnd = firstResponse.end;
    const originalJson = firstResponse.json;
    await handler({ method: "POST", body: project, ip: "198.51.100.40" } as Request, firstResponse as unknown as Response);
    await discoveryStarted;

    const staleBody = responseBody(firstResponse) as {
      researchCache: { state: string; refreshStatus: string };
      evidence: unknown[];
    };
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.endCalls, 1);
    assert.equal(firstResponse.jsonCalls, 0);
    assert.equal(firstResponse.end, originalEnd);
    assert.equal(firstResponse.json, originalJson);
    assert.equal(staleBody.researchCache.state, "stale");
    assert.equal(staleBody.researchCache.refreshStatus, "running");
    assert.equal(staleBody.evidence.length, 16);
    assert.equal(fake.locked, true);
    assert.equal(fake.releasedClients, 0);
    assert.equal(providerInvocations, 1);

    const secondResponse = productionResponseStub();
    await handler({ method: "POST", body: project, ip: "198.51.100.40" } as Request, secondResponse as unknown as Response);
    const rejectedBody = responseBody(secondResponse) as { errorType?: string };
    assert.equal(secondResponse.statusCode, 503);
    assert.equal(rejectedBody.errorType, "research-capacity-busy");
    assert.equal(handlerInvocations, 1);
    assert.equal(providerInvocations, 1);
    assert.equal(rateLimitChecks, 1);
    assert.equal(fake.locked, true);
    assert.equal(fake.unlockQueries, 0);

    t.mock.timers.tick(RESEARCH_PROJECT_TIMEOUT_MS - 1);
    assert.equal(providerAborted, false);
    assert.equal(fake.locked, true);
    assert.equal(fake.unlockQueries, 0);
    t.mock.timers.tick(1);
    await discoverySettled;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(providerAborted, true);
    assert.equal(fake.locked, true);
    assert.equal(fake.unlockQueries, 0);
    assert.equal(providerInvocations, 1);
    assert.equal(fetchInvocations, 0);

    t.mock.timers.tick(110_000 - RESEARCH_PROJECT_TIMEOUT_MS - 1);
    assert.equal(fake.locked, true);
    assert.equal(fake.unlockQueries, 0);
    assert.equal(handlerInvocations, 1);
    assert.equal(providerInvocations, 1);
    assert.equal(fetchInvocations, 0);
    t.mock.timers.tick(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.locked, false);
    assert.equal(fake.unlockQueries, 1);
    assert.equal(fake.releasedClients, 2);
    t.mock.timers.tick(110_000);
    assert.equal(fake.unlockQueries, 1);
    assert.equal(fake.releasedClients, 2);
    for (let attempt = 0; cache.status(key).refreshStatus === "running" && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.notEqual(cache.status(key).refreshStatus, "running");
  } finally {
    releaseDiscovery?.();
    if (providerInvocations > 0) {
      for (let attempt = 0; cache.status(key).refreshStatus === "running" && attempt < 100; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("an uncertain lock-acquisition timeout destroys its session and fails closed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const releases: boolean[] = [];
  const admission = createExclusiveResearchAdmission({
    connect: async () => ({
      query: () => new Promise(() => {}),
      release: (destroy: boolean) => { releases.push(destroy); },
    }),
  } as never);
  const pending = assert.rejects(admission.acquire(), /timed out/);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2_000);
  await pending;
  assert.deepEqual(releases, [true]);
});