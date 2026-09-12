import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  COMPUTE_ATLAS_FACILITIES_URL,
  COMPUTE_ATLAS_STATS_URL,
  DIRECTORY_CACHE_TTL_MS,
  EMBEDDED_SNAPSHOT,
  aggregateStats,
  CORPORATE_ALIASES,
  clearDirectoryCache,
  handleDirectoryRequest,
  getDirectory,
  getDirectoryStats,
  mapOperatorExposure,
  normalizeFacility,
  normalizeStatus,
  providerUpdatedAt,
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

test("documents reviewed corporate aliases without treating AI classification as an NVIDIA match", () => {
  assert.ok(CORPORATE_ALIASES.some((alias) => alias.match === "aws" && alias.company === "Amazon"));
  assert.ok(CORPORATE_ALIASES.some((alias) => alias.match === "facebook" && alias.company === "Meta"));
  const nonNvidia = normalizeFacility(facility({
    id: "operator-only",
    name: "Independent AI Campus",
    operator: "Independent Colocation",
    aiClassification: "ai_training",
  }));
  assert.deepEqual(nonNvidia.connectedCompanies, []);
});

test("keeps Lancium directory identity explicitly unverified without merging it", () => {
  const canonical = normalizeFacility({
    ...facility(),
    id: "stargate-abilene-tx",
    name: "Stargate Abilene",
    operator: "Crusoe / OpenAI / Oracle",
    location: { city: "Abilene", county: "Taylor", state: "TX" },
  });
  const related = normalizeFacility({
    ...facility(),
    id: "lancium-clean-campus-1",
    name: "Lancium Clean Campus",
    operator: "Lancium",
    location: { city: "Abilene", county: "Taylor", state: "TX" },
  });
  assert.equal(canonical.canonicalProjectId, "stargate-abilene");
  assert.equal(canonical.directoryDisposition, "canonical");
  assert.equal(related.canonicalProjectId, undefined);
  assert.equal(related.directoryDisposition, "unverified-related");
  assert.notEqual(canonical.id, related.id);
  assert.match(related.relationshipReason, /co-mentioned|unverified/i);
  assert.doesNotMatch(related.relationshipReason, /same[- ]campus/i);

  const elsewhere = normalizeFacility({
    ...facility(),
    id: "lancium-clean-campus-elsewhere",
    name: "Lancium Clean Campus",
    location: { city: "Phoenix", county: "Maricopa", state: "AZ" },
  });
  assert.equal(elsewhere.directoryDisposition, undefined);

  const phase = normalizeFacility({
    ...facility(),
    id: "stargate-abilene-tx-phase-2",
    name: "Stargate Abilene",
    location: { city: "Abilene", county: "Taylor", state: "TX" },
  });
  assert.equal(phase.canonicalProjectId, undefined);
  assert.equal(phase.directoryDisposition, "unverified-related");

  const sameNameElsewhere = normalizeFacility({
    ...facility(),
    id: "stargate-abilene-phoenix",
    name: "Stargate Abilene",
    location: { city: "Phoenix", county: "Maricopa", state: "AZ" },
  });
  assert.equal(sameNameElsewhere.canonicalProjectId, undefined);
  assert.equal(sameNameElsewhere.directoryDisposition, undefined);
});

test("uses only validated provider timestamps for freshness", () => {
  assert.equal(providerUpdatedAt({}), null);
  assert.equal(providerUpdatedAt({ lastUpdated: "not-a-date", updated_at: "2026-08-31T12:00:00.000Z" }), "2026-08-31T12:00:00.000Z");
  assert.equal(providerUpdatedAt({ metadata: { updatedAt: "2026-08-30T12:00:00.000Z" } }), "2026-08-30T12:00:00.000Z");
  assert.equal(providerUpdatedAt({ facilities: [{ lastUpdated: "2026-08-29T12:00:00.000Z" }, { updatedAt: "2026-08-31T12:00:00.000Z" }] }), "2026-08-31T12:00:00.000Z");
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
  assert.equal("cachedAt" in cached, false);

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

test("paginates directory responses at the server boundary", async () => {
  clearDirectoryCache();
  const records = Array.from({ length: 30 }, (_, index) => facility({
    id: `facility-${index}`,
    name: `Facility ${index}`,
    location: { city: "Austin", county: "Travis", state: "TX" },
  }));
  const response = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
  await handleDirectoryRequest(
    { method: "GET", url: "/api/directory?limit=24&offset=24&state=TX" },
    response,
    { fetchImpl: upstreamFetch({ records }), now: () => 4_000_000 },
  );
  const page = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(page.facilities.length, 6);
  assert.equal(page.totalFacilities, 30);
  assert.equal(page.offset, 24);
  assert.equal(page.limit, 24);
  assert.equal(page.hasMore, false);
});

test("puts Texas then Arizona entry points first without excluding other states", async () => {
  clearDirectoryCache();
  const records = [
    facility({ id: "az-facility", name: "Arizona Facility", location: { city: "Mesa", county: "Maricopa", state: "AZ" } }),
    facility({ id: "tx-facility", name: "Texas Facility", location: { city: "Abilene", county: "Taylor", state: "TX" } }),
    facility({ id: "va-facility", name: "Virginia Facility", location: { city: "Ashburn", county: "Loudoun", state: "VA" } }),
  ];
  const response = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
  await handleDirectoryRequest(
    { method: "GET", url: "/api/directory?limit=24&offset=0" },
    response,
    { fetchImpl: upstreamFetch({ records }), now: () => 5_000_000 },
  );
  const page = JSON.parse(response.body);
  assert.deepEqual(page.facilities.map((item) => item.id), ["tx-facility", "az-facility", "va-facility"]);
  assert.equal(page.diagnostics.pagination.texasFirst, true);
  assert.equal(page.totalAvailable, 3);
  assert.equal(page.totalMatching, 3);
});

test("deduplicates repeated provider ids while retaining distinct campus identities", async () => {
  clearDirectoryCache();
  const records = [
    facility({ id: "same-campus", name: "Same Campus", location: { city: "Austin", county: "Travis", state: "TX" } }),
    facility({ id: "same-campus", name: "Same Campus", location: { city: "Austin", county: "Travis", state: "TX" } }),
    facility({ id: "other-campus", name: "Same Campus", location: { city: "Dallas", county: "Dallas", state: "TX" } }),
  ];
  const response = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
  await handleDirectoryRequest(
    { method: "GET", url: "/api/directory?limit=24" },
    response,
    { fetchImpl: upstreamFetch({ records }), now: () => 6_000_000 },
  );
  const page = JSON.parse(response.body);
  assert.deepEqual(page.facilities.map((item) => item.id), ["same-campus", "other-campus"]);
  assert.equal(page.totalAvailable, 2);
  assert.equal(page.totalMatching, 2);
});