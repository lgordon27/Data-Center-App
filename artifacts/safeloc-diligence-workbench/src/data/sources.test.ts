import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SOURCE_STATES,
  formatElectricityCostAttribution,
  formatSourceTimestamp,
  sourceStateMap,
} from "./sources";

test("the default source registry is truthful about bundled provider state", () => {
  assert.deepEqual(
    DEFAULT_SOURCE_STATES.map(({ id, status, dataOrigin, version }) => ({ id, status, dataOrigin, version })),
    [
      { id: "fema-nri", status: "embedded", dataOrigin: "embedded", version: "v1.20" },
      { id: "ercot-queue", status: "embedded", dataOrigin: "embedded", version: "Bundled case baseline" },
      { id: "eia", status: "embedded", dataOrigin: "embedded", version: "Bundled case baseline" },
      { id: "gridtracker-mcp", status: "disconnected", dataOrigin: "embedded", version: undefined },
    ],
  );
});

test("provider metadata can promote EIA to a timestamped live response", () => {
  const eia = sourceStateMap({
    eia: { status: "live", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z", version: "series-2025" },
  }).eia;
  assert.equal(formatSourceTimestamp(eia.timestamp), "Aug 29, 2026");
  assert.equal(
    formatElectricityCostAttribution(42, eia),
    "Electricity cost: $42/MWh (U.S. Energy Information Administration Open Data, live · Aug 29, 2026)",
  );
});

test("cached EIA observations retain provider attribution", () => {
  const eia = sourceStateMap({
    eia: { status: "cached", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z" },
  }).eia;
  assert.equal(
    formatElectricityCostAttribution(42.5, eia),
    "Electricity cost: $42.5/MWh (U.S. Energy Information Administration Open Data, cached · Aug 29, 2026)",
  );
});

test("unsupported or incomplete provider states do not create false live claims", () => {
  const sources = sourceStateMap({
    "fema-nri": { status: "live", dataOrigin: "provider", timestamp: "2026-08-29T12:00:00.000Z" },
    eia: { status: "live", dataOrigin: "provider" },
  });
  assert.equal(sources["fema-nri"].status, "embedded");
  assert.equal(sources.eia.status, "embedded");
  assert.equal(sources.eia.timestamp, undefined);
});

test("bundled EIA values remain embedded estimates", () => {
  assert.equal(
    formatElectricityCostAttribution(42, sourceStateMap().eia),
    "Electricity cost: $42/MWh (embedded estimate)",
  );
});

test("cached status requires a timestamped provider response", () => {
  assert.equal(sourceStateMap({ eia: { status: "cached", dataOrigin: "embedded", timestamp: "2026-08-29T12:00:00.000Z" } }).eia.status, "embedded");
  assert.equal(sourceStateMap({ eia: { status: "cached", dataOrigin: "provider", timestamp: "not-a-date" } }).eia.status, "embedded");
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