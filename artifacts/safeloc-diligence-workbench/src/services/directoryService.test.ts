import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DIRECTORY_CACHE_WARNING_MS, directoryFreshness, fetchAllCompanyDirectoryFacilities, fetchDirectory, formatDirectoryAge, mergeDirectoryFacilities, parseDirectoryResponse, parseDirectoryStatsResponse } from "./directoryService";

const sourceMetadata = {
  provider: "Compute Atlas",
  attributionUrl: "https://compute-atlas.com",
  status: "live",
  dataOrigin: "provider",
};

const record = {
  id: "facility-1",
  name: "Facility One",
  operator: "Microsoft",
  city: "Austin",
  county: "Travis",
  state: "TX",
  capacityMW: 100,
  availableCapacityMW: 100,
  status: "operating",
  confidence: "confirmed",
  aiClassification: "ai_training",
  sourceUrl: "https://example.com/source",
  connectedCompanies: ["Microsoft"],
  connectedFunds: ["QQQ"],
  lastUpdated: null,
};

test("parses a directory response and keeps source metadata explicit", () => {
  const parsed = parseDirectoryResponse({ facilities: [record], sourceMetadata });
  assert.equal(parsed.facilities[0].capacityMW, 100);
  assert.equal(parsed.sourceMetadata.status, "live");
  assert.equal(parsed.sourceMetadata.dataOrigin, "provider");
});

test("rejects malformed directory records and stats envelopes", () => {
  assert.throws(() => parseDirectoryResponse({ facilities: [{ ...record, id: 4 }], sourceMetadata }));
  assert.throws(() => parseDirectoryStatsResponse({ stats: {}, sourceMetadata }));
});

test("fetches directory through same-origin JSON and parses it", async () => {
  const result = await fetchDirectory(async (input) => {
    assert.equal(input, "/api/directory");
    return new Response(JSON.stringify({ facilities: [record], sourceMetadata }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(result.facilities[0].id, "facility-1");
});

test("loads provider-associated company records after index 100 incrementally", async () => {
  const requests: string[] = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    ...record,
    id: `microsoft-${index}`,
    name: `Microsoft Facility ${index}`,
  }));
  const afterIndex100 = {
    ...record,
    id: "microsoft-100",
    name: "Microsoft Facility After Index 100",
    state: "AZ",
  };
  const progress: number[] = [];
  const facilities = await fetchAllCompanyDirectoryFacilities("Microsoft", (loaded) => {
    progress.push(loaded.length);
  }, async (input) => {
    const url = String(input);
    requests.push(url);
    const secondPage = url.includes("offset=100");
    return new Response(JSON.stringify({
      facilities: secondPage ? [afterIndex100] : firstPage,
      sourceMetadata,
      totalMatching: 101,
      offset: secondPage ? 100 : 0,
      limit: 100,
      nextOffset: secondPage ? null : 100,
      hasMore: !secondPage,
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.deepEqual(progress, [100, 101]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.includes("company=Microsoft")));
  assert.equal(facilities.at(-1)?.id, "microsoft-100");
});

test("formats provider and retained ages without conflating embedded snapshots", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");
  assert.equal(formatDirectoryAge("2026-08-31T11:45:00.000Z", now), "15 min ago");
  assert.deepEqual(directoryFreshness({
    ...sourceMetadata,
    status: "cached",
    dataOrigin: "provider",
    fetchedAt: new Date(now - DIRECTORY_CACHE_WARNING_MS).toISOString(),
    sourceUpdatedAt: "2026-08-31T10:00:00.000Z",
  }, now), {
    label: "Provider updated 2 hr ago · retained 20 hr ago",
    caution: true,
  });
  assert.deepEqual(directoryFreshness({
    ...sourceMetadata,
    status: "embedded",
    dataOrigin: "embedded",
    snapshotVersion: "2026-08-31",
    fetchedAt: new Date(now).toISOString(),
  }, now), {
    label: "Embedded snapshot · 2026-08-31",
    caution: false,
  });
});

test("keeps truthful catalog totals and merges pages by stable campus identity", () => {
  const first = { ...record, id: "campus-a", city: "Austin" };
  const duplicate = { ...record, id: "campus-a", city: "Austin", capacityMW: 120 };
  const secondCampus = { ...record, id: "campus-b", city: "Dallas" };
  const parsed = parseDirectoryResponse({
    facilities: [first],
    totalAvailable: 2,
    totalMatching: 2,
    offset: 0,
    limit: 1,
    nextOffset: 1,
    hasMore: true,
    sourceMetadata,
  });
  assert.equal(parsed.totalAvailable, 2);
  assert.equal(parsed.totalMatching, 2);
  const incoming = parseDirectoryResponse({ facilities: [duplicate, secondCampus], sourceMetadata }).facilities;
  assert.deepEqual(mergeDirectoryFacilities(parsed.facilities, incoming).map((facility) => facility.id), ["campus-a", "campus-b"]);
  assert.equal(mergeDirectoryFacilities(parsed.facilities, incoming)[0].capacityMW, 100);
});