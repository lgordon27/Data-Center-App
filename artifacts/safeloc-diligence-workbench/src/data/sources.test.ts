import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SOURCE_STATES,
  formatElectricityCostAttribution,
  formatSourceTimestamp,
  sourceApplicabilityText,
  sourceStatusLabel,
  sourceStateMap,
} from "./sources";

test("the default source registry is truthful about bundled provider state", () => {
  assert.deepEqual(
    DEFAULT_SOURCE_STATES.map(({ id, status, dataOrigin, version }) => ({ id, status, dataOrigin, version })),
    [
      { id: "fema-nri", status: "embedded", dataOrigin: "embedded", version: "v1.20" },
      { id: "ercot-queue", status: "embedded", dataOrigin: "embedded", version: "Bundled case baseline" },
      { id: "eia", status: "embedded", dataOrigin: "embedded", version: "Bundled case baseline" },
    ],
  );
});

test("provider metadata separates retrieval time from source-as-of time", () => {
  const eia = sourceStateMap({
    eia: {
      status: "live",
      dataOrigin: "provider",
      retrievedAt: "2026-08-30T12:00:00.000Z",
      sourceAsOf: "2026-08-29T12:00:00.000Z",
      freshness: "fresh",
      version: "series-2025",
    },
  }).eia;
  assert.equal(formatSourceTimestamp(eia.retrievedAt), "Aug 30, 2026");
  assert.equal(formatSourceTimestamp(eia.sourceAsOf), "Aug 29, 2026");
  assert.equal(
    formatElectricityCostAttribution(42, eia),
    "Electricity cost: $42/MWh (U.S. Energy Information Administration Open Data, Live · retrieved Aug 30, 2026 · source as of Aug 29, 2026)",
  );
});

test("cached EIA observations retain provider attribution", () => {
  const eia = sourceStateMap({
    eia: { status: "cached", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z" },
  }).eia;
  assert.equal(
    formatElectricityCostAttribution(42.5, eia),
    "Electricity cost: $42.5/MWh (U.S. Energy Information Administration Open Data, Cached · retrieved Aug 29, 2026 · source date unknown)",
  );
});

test("stale provider data is not labeled live", () => {
  const eia = sourceStateMap({
    eia: {
      status: "live",
      dataOrigin: "provider",
      retrievedAt: "2026-09-10T12:00:00.000Z",
      sourceAsOf: "2026-06-01T00:00:00.000Z",
      freshness: "stale",
    },
  }).eia;
  assert.equal(sourceStatusLabel(eia), "Stale");
  assert.match(formatElectricityCostAttribution(55, eia), /Stale · retrieved Sep 10, 2026 · source as of Jun 1, 2026/);
});

test("unsupported or incomplete provider states do not create false live claims", () => {
  const sources = sourceStateMap({
    "fema-nri": { status: "live", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z" },
    eia: { status: "live", dataOrigin: "provider" },
  });
  assert.equal(sources["fema-nri"].status, "embedded");
  assert.equal(sources.eia.status, "unknown");
  assert.equal(sources.eia.timestamp, undefined);
  assert.equal(sources.eia.freshness, "unknown");
  assert.equal(sourceStatusLabel(sources.eia), "Freshness unknown");
});

test("bundled EIA values remain embedded estimates", () => {
  assert.equal(
    formatElectricityCostAttribution(42, sourceStateMap().eia),
    "Electricity cost: $42/MWh (embedded estimate)",
  );
});

test("missing or malformed timestamps remain unknown without relabeling provider data as embedded", () => {
  assert.equal(sourceStateMap({ eia: { status: "cached", dataOrigin: "embedded", timestamp: "2026-08-29T12:00:00.000Z" } }).eia.status, "embedded");
  const withoutTimestamp = sourceStateMap({ eia: { status: "cached", dataOrigin: "provider" } }).eia;
  assert.equal(withoutTimestamp.status, "unknown");
  assert.equal(withoutTimestamp.timestamp, undefined);
  assert.equal(withoutTimestamp.freshness, "unknown");
  const malformedTimestamp = sourceStateMap({ eia: { status: "cached", dataOrigin: "provider", timestamp: "not-a-date" } }).eia;
  assert.equal(malformedTimestamp.status, "unknown");
  assert.equal(malformedTimestamp.timestamp, undefined);
  assert.equal(malformedTimestamp.freshness, "unknown");
  assert.equal(sourceStateMap({ eia: { status: "cached", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z" } }).eia.status, "cached");
});

test("the provider boundary automatically falls back from unavailable live data to a retained cache", () => {
  const eia = sourceStateMap({
    eia: {
      live: { status: "live", dataOrigin: "provider" },
      cached: {
        status: "cached",
        dataOrigin: "provider",
        timestamp: "2026-08-28T12:00:00.000Z",
        version: "series-2025",
      },
    },
  }).eia;
  assert.equal(eia.status, "cached");
  assert.equal(eia.timestamp, "2026-08-28T12:00:00.000Z");
  assert.equal(eia.dataOrigin, "provider");
});

test("provider availability never makes ERCOT applicable to an Ohio project", () => {
  assert.match(
    sourceApplicabilityText("ercot-queue", {
      kind: "custom",
      location: "New Albany, Ohio",
    }),
    /Not applicable to New Albany, Ohio; ERCOT availability does not make Texas queue data evidence/i,
  );
  assert.match(
    sourceApplicabilityText("ercot-queue", {
      kind: "custom",
      location: "Taylor County, TX",
    }),
    /Texas regional context only; it is not facility-level evidence/i,
  );
});