import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_ERCOT_RESULT,
  fetchErcotQueue,
  normalizeErcotProxyEnvelope,
} from "./ercotService";

function liveEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    status: "live",
    fetchedAt: "2026-08-30T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-07T17:27:53.695Z",
    diagnostics: {
      endpoint: "/api/ercot-queue",
      requestTimestamp: "2026-08-30T12:00:00.000Z",
      responseStatus: 200,
      cache: "miss",
      sourceFreshness: "2026-08-07T17:27:53.695Z",
      responses: [],
    },
    data: {
      projects: {
        generated_at: "2026-08-05T01:57:28.643Z",
        projects: [{
          inr: "26INR0999",
          name: "Stargate Abilene",
          capacity_mw: 1200,
          projected_cod: "2027-06-30",
          status_raw: "Delayed pending IA",
          cod_delayed: true,
          queue_position: 42,
          milestones: { ia_signed: null },
        }],
      },
      codHistory: [{
        inr: "26INR0999",
        old_value: "2026-06-30",
        new_value: "2027-06-30",
      }],
      loadQueueSummary: {
        generated_at: "2026-08-07T00:00:00Z",
        summary: {
          as_of_date: "2026-06-18",
          source_refresh_date: "2026-07-15",
          buckets: [{ status: "submitted", mw: 466_497, project_count: null }],
          by_sector: [{ sector: "data_center", mw: 420_812, project_count: null }],
        },
      },
      siteFreshness: { generated_at: "2026-08-07T17:27:53.695Z" },
    },
    ...overrides,
  };
}

test("normalizes live aggregate metrics and a named project without inventing request counts", () => {
  const result = normalizeErcotProxyEnvelope(liveEnvelope());
  assert.equal(result.status, "live");
  assert.equal(result.providerStatus, "live");
  assert.equal(result.stats.totalGw, 466.497);
  assert.equal(Number(result.stats.dataCenterShare.toFixed(1)), 90.2);
  assert.equal(result.stats.dataCenterRequestCount, null);
  assert.equal(result.matchingProject?.name, "Stargate Abilene");
  assert.equal(result.matchingProject?.queuePosition, 42);
  assert.equal(result.matchingProject?.codSlipCount, 1);
  assert.equal(result.matchingProject?.totalDaysSlipped, 365);
  assert.equal(result.matchingProject?.explicitDelayOrCancellation, true);
  assert.equal(result.sourceMetadata.status, "live");
});

test("preserves cached provider metadata", () => {
  const result = normalizeErcotProxyEnvelope(liveEnvelope({
    status: "cached",
    diagnostics: {
      endpoint: "/api/ercot-queue",
      requestTimestamp: "2026-08-30T12:00:00.000Z",
      responseStatus: 200,
      cache: "hit",
      sourceFreshness: "2026-08-07T17:27:53.695Z",
      responses: [],
    },
  }));
  assert.equal(result.status, "cached");
  assert.equal(result.diagnostics.cache, "hit");
  assert.equal(result.sourceMetadata.status, "cached");
});

test("uses the clearly labeled fallback for malformed data", () => {
  const result = normalizeErcotProxyEnvelope(liveEnvelope({
    data: { projects: {}, codHistory: {}, loadQueueSummary: {}, siteFreshness: {} },
  }));
  assert.equal(result.status, "embedded");
  assert.equal(result.providerStatus, "embedded");
  assert.equal(result.matchingProject, null);
  assert.equal(result.stats.totalMw, FALLBACK_ERCOT_RESULT.stats.totalMw);
});

test("falls back when the proxy is unavailable", async () => {
  const result = await fetchErcotQueue(async () => {
    throw new Error("network unavailable");
  });
  assert.equal(result.status, "embedded");
  assert.equal(result.providerStatus, "embedded");
  assert.match(result.diagnostics.error ?? "", /network unavailable/);
});

test("falls back when the proxy reports an upstream failure", async () => {
  const result = await fetchErcotQueue(async () => new Response(JSON.stringify({ status: "error" }), {
    status: 502,
    headers: { "content-type": "application/json" },
  }));
  assert.equal(result.status, "embedded");
  assert.equal(result.diagnostics.responseStatus, 502);
});

test("rejects a provider result without parseable freshness", () => {
  const result = normalizeErcotProxyEnvelope(liveEnvelope({
    sourceUpdatedAt: "not-a-date",
    diagnostics: {
      endpoint: "/api/ercot-queue",
      requestTimestamp: "2026-08-30T12:00:00.000Z",
      responseStatus: 200,
      cache: "miss",
      sourceFreshness: "also-not-a-date",
      responses: [],
    },
    data: {
      ...(liveEnvelope().data as Record<string, unknown>),
      loadQueueSummary: {
        generated_at: "not-a-date",
        summary: {
          as_of_date: "2026-06-18",
          source_refresh_date: "not-a-date",
          buckets: [{ status: "submitted", mw: 466_497 }],
          by_sector: [{ sector: "data_center", mw: 420_812, project_count: null }],
        },
      },
    },
  }));
  assert.equal(result.status, "embedded");
  assert.equal(result.providerStatus, "embedded");
  assert.equal(result.sourceMetadata.status, "embedded");
});