import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fetchDirectory, parseDirectoryResponse, parseDirectoryStatsResponse } from "./directoryService";

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