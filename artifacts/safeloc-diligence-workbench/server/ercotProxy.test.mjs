import assert from "node:assert/strict";
import test from "node:test";

import { fetchErcotQueueSnapshot, handleErcotQueueRequest } from "./ercotProxy.mjs";

function providerFetch({ withTimestamps = true } = {}) {
  return async (input) => {
    const url = String(input);
    const payload = url.endsWith("/projects.json")
      ? { projects: [], ...(withTimestamps ? { generated_at: "2026-08-07T17:27:53.695Z" } : {}) }
      : url.endsWith("/cod_history.json")
        ? []
        : url.endsWith("/load_queue_summary.json")
          ? {
              ...(withTimestamps ? { generated_at: "2026-08-07T17:27:53.695Z" } : {}),
              summary: {
                as_of_date: "2026-06-18",
                source_refresh_date: withTimestamps ? "2026-07-15" : null,
                buckets: [{ status: "submitted", mw: 466_497 }],
                by_sector: [{ sector: "data_center", mw: 420_812, project_count: 120 }],
              },
            }
          : withTimestamps ? { generated_at: "2026-08-07T17:27:53.695Z" } : {};
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("keeps retrieval and source timestamps distinct and serves the last good snapshot after refresh failure", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  try {
    const fetchedAt = "2026-09-10T12:00:00.000Z";
    const fresh = await fetchErcotQueueSnapshot({
      fetchImpl: providerFetch(),
      now: () => fetchedAt,
    });
    assert.equal(fresh.status, "live");
    assert.equal(fresh.fetchedAt, fetchedAt);
    assert.equal(fresh.sourceUpdatedAt, "2026-08-07T17:27:53.695Z");

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => { throw new Error("provider unavailable"); },
    });
    const response = responseRecorder();
    await handleErcotQueueRequest({ method: "GET" }, response);
    const cached = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(cached.status, "cached");
    assert.equal(cached.fetchedAt, fresh.fetchedAt);
    assert.equal(cached.sourceUpdatedAt, fresh.sourceUpdatedAt);
    assert.equal(cached.diagnostics.error, "provider unavailable");

    const withoutTimestamps = await fetchErcotQueueSnapshot({
      fetchImpl: providerFetch({ withTimestamps: false }),
      now: () => "2026-09-11T12:00:00.000Z",
    });
    assert.equal(withoutTimestamps.status, "live");
    assert.equal(withoutTimestamps.fetchedAt, "2026-09-11T12:00:00.000Z");
    assert.equal(withoutTimestamps.sourceUpdatedAt, null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "fetch", descriptor);
  }
});