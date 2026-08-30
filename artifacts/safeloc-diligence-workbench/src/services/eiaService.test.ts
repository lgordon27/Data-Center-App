import assert from "node:assert/strict";
import test from "node:test";

import {
  EIA_CACHE_KEY,
  calculateAcceleration,
  calculateYearOverYearChange,
  fetchEiaElectricity,
  getEiaModelInputs,
  normalizeEiaEnvelope,
  type EiaPricePoint,
} from "./eiaService";

const prices: EiaPricePoint[] = Array.from({ length: 25 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 7 + index, 1));
  return {
    period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    pricePerMwh: index < 12 ? 40 + index : 45 + index * 1.5,
  };
});

function envelope(status: "live" | "cached" = "live") {
  return {
    status,
    fetchedAt: "2026-08-30T12:00:00.000Z",
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    data: {
      priceHistory: prices.slice(-24),
      priceCalculationHistory: prices,
      latestPrice: prices.at(-1)!.pricePerMwh,
      latestPricePeriod: prices.at(-1)!.period,
      generationHistory: [{
        period: "2026-08",
        generationMwh: { naturalGas: 40, wind: 25, solar: 10, nuclear: 10, coal: 5, other: 10 },
        totalMwh: 100,
        shares: { naturalGas: 40, wind: 25, solar: 10, nuclear: 10, coal: 5, other: 10 },
      }],
      consumptionHistory: [{ period: "2026-08", consumptionMwh: 120_000 }],
    },
  };
}

test("normalizes a schema-valid provider envelope and month windows", () => {
  const result = normalizeEiaEnvelope(envelope());
  assert.ok(result);
  assert.equal(result.status, "live");
  assert.equal(result.priceHistory.length, 24);
  assert.equal(result.generationHistory.length, 1);
  assert.equal(result.sourceMetadata.dataOrigin, "provider");
  assert.equal(result.sourceMetadata.timestamp, "2026-08-01T00:00:00.000Z");
});

test("calculates latest YoY and acceleration from structured prices", () => {
  const expectedYoy = ((prices[24].pricePerMwh - prices[12].pricePerMwh) / prices[12].pricePerMwh) * 100;
  assert.equal(calculateYearOverYearChange(prices), expectedYoy);
  const acceleration = calculateAcceleration(prices);
  assert.equal(acceleration.latest, expectedYoy);
  assert.equal(acceleration.trend, "decelerating");
  assert.notEqual(acceleration.preceding, null);
  assert.equal(calculateAcceleration(prices.slice(-12)).trend, "unavailable");
});

test("uses EIA model values only for validated provider observations", () => {
  assert.deepEqual(getEiaModelInputs({ latestPrice: 51, yoyChangePercent: 4.5, dataOrigin: "provider" }), {
    electricityRate: 51,
    electricityEscalationRate: 4.5,
  });
  assert.deepEqual(getEiaModelInputs({ latestPrice: 99, yoyChangePercent: 20, dataOrigin: "embedded" }), {
    electricityRate: 42,
    electricityEscalationRate: 6,
  });
});

test("uses a prior successful browser cache after a proxy failure", async () => {
  const storage = new Map<string, string>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });
  try {
    const live = await fetchEiaElectricity(async () => new Response(JSON.stringify(envelope()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    assert.equal(live.status, "live");
    assert.ok(storage.has(EIA_CACHE_KEY));
    const cached = await fetchEiaElectricity(async () => new Response(JSON.stringify({
      status: "unavailable",
      diagnostics: { error: "EIA_API_KEY is not configured on the server." },
    }), { status: 503, headers: { "content-type": "application/json" } }));
    assert.equal(cached.status, "cached");
    assert.equal(cached.latestPrice, live.latestPrice);
    assert.match(cached.error ?? "", /not configured/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});

test("falls back to the embedded rate when no valid cache exists", async () => {
  const result = await fetchEiaElectricity(async () => new Response(JSON.stringify({
    status: "error",
    diagnostics: { error: "upstream unavailable" },
  }), { status: 503, headers: { "content-type": "application/json" } }));
  assert.equal(result.status, "fallback");
  assert.equal(result.dataOrigin, "embedded");
  assert.equal(result.latestPrice, 42);
});