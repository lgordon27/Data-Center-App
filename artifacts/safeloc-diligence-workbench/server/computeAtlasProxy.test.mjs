import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  COMPUTE_ATLAS_FACILITIES_URL,
  COMPUTE_ATLAS_STATS_URL,
  DIRECTORY_CACHE_TTL_MS,
  EMBEDDED_SNAPSHOT,
  aggregateStats,
  clearDirectoryCache,
  getDirectory,
  getDirectoryStats,
  mapOperatorExposure,
  normalizeFacility,
  normalizeStatus,
  selectAvailableCapacityMW,
  sortFacilities,
} from "./computeAtlasProxy.mjs";

function response(body, status = 200, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    json: async () => body,
  };
}

function facility(overrides = {}) {
  return {
    id: "test-facility",
    name: "Test Facility",
    operator: "Microsoft / Oracle",
    status: "under_construction",
    confidence: "confirmed",
    location: { city: "Austin", county: "Travis", state: "TX" },
    capacityMw: { planned: 400, operational: 125 },
    sources: [{ url: "https://example.com/facility" }],
    ...overrides,
  };
}

function upstreamFetch({ records = [facility()], stats = { count: 1, states: 1, operationalMw: 125, plannedMw: 400, underConstructionMw: 400 }, fail = false } = {}) {
  return async (url) => {
    if (fail) throw new Error("upstream unavailable");
    if (url === COMPUTE_ATLAS_FACILITIES_URL) return response({ count: records.length, facilities: records });
    if (url === COMPUTE_ATLAS_STATS_URL) return response(stats);
    throw new Error(`unexpected URL ${url}`);
  };
}

test("normalizes statuses, nested capacity, location, AI classification, and safe sources", () => {
  const record = normalizeFacility(facility({ aiClassification: "confirmed", capacityMw: { planned: 400, operational: 125 } }));
  assert.deepEqual(record, {
    id: "test-facility",
    name: "Test Facility",
    operator: "Microsoft / Oracle",
    city: "Austin",
    county: "Travis",
    state: "TX",
    capacityMW: 125,
    availableCapacityMW: 125,
    status: "construction",
    confidence: "confirmed",
    aiClassification: "confirmed",
    sourceUrl: "https://example.com/facility",
    connectedCompanies: ["Microsoft", "Oracle"],
    connectedFunds: ["QQQ", "XLK"],
    lastUpdated: null,
  });
  assert.equal(normalizeStatus("proposed"), "planned");
  assert.equal(normalizeStatus("cancelled"), "cancelled");
  assert.equal(selectAvailableCapacityMW({ available: 80, operational: 120 }), 80);
  assert.equal(selectAvailableCapacityMW({ planned: "unknown" }), null);
  assert.deepEqual(mapOperatorExposure("Google / Amazon"), { companies: ["Google", "Amazon"], funds: ["QQQ", "XLK", "XLY"] });
});

test("sorts by state, descending available capacity, then name and aggregates totals", () => {
  const records = [
    normalizeFacility(facility({ id: "b", name: "B", location: { state: "AZ", city: "Mesa" }, capacityMw: { operational: 80 } })),
    normalizeFacility(facility({ id: "c", name: "C", location: { state: "TX", city: "Austin" }, capacityMw: {} })),
    normalizeFacility(facility({ id: "a", name: "A", location: { state: "TX", city: "Austin" }, capacityMw: { operational: 200 } })),
  ];
  assert.deepEqual(sortFacilities(records).map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(aggregateStats(records), {
    totalFacilities: 3,
    stateCounts: { AZ: 1, TX: 2 },
    statusCounts: { construction: 3 },
    capacityTotalsMW: { total: 280, operating: 0, planned: 0, construction: 280, undisclosed: 1 },
  });
});

test("uses live provider data, then a retained response for 24 hours, then embedded snapshot", async () => {
  clearDirectoryCache();
  let now = 1_000_000;
  const live = await getDirectory({ fetchImpl: upstreamFetch(), now: () => now });
  assert.equal(live.sourceMetadata.status, "live");
  assert.equal(live.sourceMetadata.dataOrigin, "provider");
  assert.equal(live.facilities[0].name, "Test Facility");

  const cached = await getDirectory({ fetchImpl: upstreamFetch({ fail: true }), now: () => now + DIRECTORY_CACHE_TTL_MS - 1 });
  assert.equal(cached.sourceMetadata.status, "cached");
  assert.equal(cached.sourceMetadata.dataOrigin, "provider");

  const embedded = await getDirectory({ fetchImpl: upstreamFetch({ fail: true }), now: () => now + DIRECTORY_CACHE_TTL_MS + 1 });
  assert.equal(embedded.sourceMetadata.status, "embedded");
  assert.equal(embedded.sourceMetadata.dataOrigin, "embedded");
  assert.equal(embedded.facilities.length, EMBEDDED_SNAPSHOT.length);
  assert.notEqual(embedded.sourceMetadata.status, "cached");
  assert.match(String(embedded.diagnostics.error), /unavailable/);
});

test("stats uses the stats endpoint plus facilities and keeps the same freshness semantics", async () => {
  clearDirectoryCache();
  const result = await getDirectoryStats({ fetchImpl: upstreamFetch(), now: () => 2_000_000 });
  assert.equal(result.sourceMetadata.status, "live");
  assert.equal(result.stats.totalFacilities, 1);
  assert.equal(result.stats.capacityTotalsMW.operating, 125);
  assert.equal(result.stats.statusCounts.construction, 1);

  const fallback = await getDirectoryStats({ fetchImpl: upstreamFetch({ fail: true }), now: () => 2_000_000 + DIRECTORY_CACHE_TTL_MS + 1 });
  assert.equal(fallback.sourceMetadata.status, "embedded");
  assert.ok(fallback.stats.totalFacilities >= 20);
});

test("malformed provider payloads do not escape as live data", async () => {
  clearDirectoryCache();
  const malformedFetch = async () => response({ facilities: [{ status: "operational" }] });
  const result = await getDirectory({ fetchImpl: malformedFetch, now: () => 3_000_000 });
  assert.equal(result.sourceMetadata.status, "embedded");
  assert.equal(result.sourceMetadata.dataOrigin, "embedded");
});