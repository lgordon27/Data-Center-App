import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateFuelShares,
  fetchEiaSnapshot,
  monthWindow,
  normalizeEiaUpstreamPayloads,
  selectMonthWindow,
} from "./eiaProxy.mjs";

function jsonResponse(data) {
  return new Response(JSON.stringify({ response: { data } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("builds deterministic rolling monthly windows", () => {
  assert.deepEqual(monthWindow(new Date("2026-08-30T12:00:00Z"), 24), {
    start: "2024-09",
    end: "2026-08",
  });
  assert.deepEqual(selectMonthWindow([
    { period: "2026-03", value: 3 },
    { period: "2026-01", value: 1 },
    { period: "2026-02", value: 2 },
  ], 2), [
    { period: "2026-02", value: 2 },
    { period: "2026-03", value: 3 },
  ]);
});

test("normalizes EIA units, ordering, and genuine fuel denominator", () => {
  const normalized = normalizeEiaUpstreamPayloads({
    price: { response: { data: [
      { period: "2026-08", price: "4.25", "price-units": "cents per kilowatthour" },
      { period: "2026-07", price: 4.1, "price-units": "cents per kilowatthour" },
    ] } },
    generation: { response: { data: [
      { period: "2026-08", fueltypeid: "ALL", generation: 100, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "NG", generation: 40, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "WND", generation: 25, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "SUN", generation: 10, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "NUC", generation: 10, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "COL", generation: 5, "generation-units": "thousand megawatthours" },
    ] } },
    consumption: { response: { data: [
      { period: "2026-08", sales: 120, "sales-units": "million kilowatthours" },
    ] } },
  });
  assert.equal(normalized.latestPrice, 42.5);
  assert.equal(normalized.latestGenerationMix.totalMwh, 100_000);
  assert.equal(normalized.latestGenerationMix.shares.naturalGas, 40);
  assert.equal(normalized.latestGenerationMix.shares.other, 10);
  assert.equal(normalized.consumptionHistory[0].consumptionMwh, 120_000);
});

test("refuses to invent a generation denominator when EIA total is absent", () => {
  const mix = aggregateFuelShares([
    { period: "2026-08", fuel: "naturalGas", generationMwh: 40 },
    { period: "2026-08", fuel: "wind", generationMwh: 30 },
    { period: "2026-08", fuel: "other", generationMwh: 30 },
  ]);
  assert.deepEqual(mix, []);
});

test("reports no-key truthfully and retains a prior successful server response", async () => {
  const missing = await fetchEiaSnapshot({ apiKey: "", now: () => "2026-08-30T12:00:00Z" });
  assert.equal(missing.status, "unavailable");
  assert.match(missing.diagnostics.error, /not configured/);

  const priceRows = Array.from({ length: 25 }, (_, index) => ({
    period: monthWindow(new Date(Date.UTC(2026, 7 - index, 1)), 1).end,
    price: 4 + index / 100,
    "price-units": "cents per kilowatthour",
  }));
  const fetchImpl = async (url) => {
    const requestUrl = new URL(String(url));
    if (requestUrl.searchParams.get("data[0]") === "sales") {
      assert.equal(requestUrl.searchParams.get("facets[stateid][]"), "TX");
      assert.equal(requestUrl.searchParams.get("facets[sectorid][]"), "ALL");
      return jsonResponse([{ period: "2026-08", sales: 100, "sales-units": "million kilowatthours" }]);
    }
    if (String(url).includes("retail-sales")) return jsonResponse(priceRows);
    assert.equal(requestUrl.searchParams.get("facets[location][]"), "TX");
    assert.equal(requestUrl.searchParams.get("facets[sectorid][]"), "99");
    assert.ok(requestUrl.searchParams.getAll("facets[fueltypeid][]").includes("ALL"));
    return jsonResponse([
      { period: "2026-08", fueltypeid: "ALL", generation: 100, "generation-units": "thousand megawatthours" },
      { period: "2026-08", fueltypeid: "NG", generation: 100, "generation-units": "thousand megawatthours" },
    ]);
  };
  const live = await fetchEiaSnapshot({ apiKey: "test-only", fetchImpl, now: () => "2026-08-30T12:00:00Z" });
  assert.equal(live.status, "live");
  const failed = await fetchEiaSnapshot({
    apiKey: "test-only",
    fetchImpl: async () => { throw new Error("offline"); },
    now: () => "2026-08-30T13:00:00Z",
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.diagnostics.cache, "hit");
});