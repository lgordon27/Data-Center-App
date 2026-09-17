import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSecArchiveUrl,
  createSecConnector,
  normalizeCik,
  parseRetryAfter,
} from "./secConnector.mjs";

const directory = { 0: { cik_str: 1234, ticker: "ACME", title: "Acme Corporation" } };
const submissions = {
  filings: {
    recent: {
      accessionNumber: ["0000001234-26-000001"],
      filingDate: ["2026-02-01"],
      form: ["8-K"],
      primaryDocument: ["acme-8k.htm"],
      primaryDocDescription: ["Project Atlas power agreement"],
    },
  },
};

function json(payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("normalizes CIKs and builds official archive URLs", () => {
  assert.equal(normalizeCik("CIK 1234"), "0000001234");
  assert.equal(
    buildSecArchiveUrl("1234", "0000001234-26-000001", "acme-8k.htm"),
    "https://www.sec.gov/Archives/edgar/data/1234/000000123426000001/acme-8k.htm",
  );
  assert.throws(() => buildSecArchiveUrl(1234, "bad", "x.htm"), /accession/i);
});

test("requires and declares the SEC user agent and spaces requests", async () => {
  assert.throws(() => createSecConnector({ userAgent: "" }), /SEC_USER_AGENT/);
  let time = Date.parse("2026-02-02T00:00:00Z");
  const calls = [];
  const waits = [];
  const connector = createSecConnector({
    userAgent: "SafeLoc tests sec@example.com",
    clock: () => time,
    sleep: async (ms) => { waits.push(ms); time += ms; },
    fetchImpl: async (url, init) => {
      calls.push({ time, url, headers: init.headers });
      return json(String(url).includes("company_tickers") ? directory : submissions);
    },
  });
  const result = await connector.search({ ticker: "acme", projectName: "Project Atlas" });
  assert.equal(calls[0].headers["user-agent"], "SafeLoc tests sec@example.com");
  assert.ok(calls[1].time - calls[0].time >= 500);
  assert.deepEqual(waits, [500]);
  assert.equal(result.candidates[0].cik, "0000001234");
});

test("uses fresh cache and conditionally reuses a 304 representation", async () => {
  let time = Date.parse("2026-02-02T00:00:00Z");
  let calls = 0;
  const seenHeaders = [];
  const connector = createSecConnector({
    userAgent: "SafeLoc tests sec@example.com",
    clock: () => time,
    sleep: async (ms) => { time += ms; },
    fetchImpl: async (url, init) => {
      calls += 1;
      seenHeaders.push(init.headers);
      const payload = String(url).includes("company_tickers") ? directory : submissions;
      return json(payload, { etag: `"${calls}"`, "cache-control": "max-age=1" });
    },
  });
  await connector.search({ ticker: "ACME", projectName: "Atlas" });
  await connector.search({ ticker: "ACME", projectName: "Atlas" });
  assert.equal(calls, 2);
  time += 1_001;
  connector.cache.forEach((entry) => { entry.expiresAt = time - 1; });
  const oldFetch = connector.cache;
  let conditionalCalls = 0;
  const conditional = createSecConnector({
    userAgent: "SafeLoc tests sec@example.com",
    cache: oldFetch,
    clock: () => time,
    sleep: async (ms) => { time += ms; },
    fetchImpl: async (_url, init) => {
      conditionalCalls += 1;
      assert.ok(init.headers["if-none-match"]);
      return new Response(null, { status: 304, headers: { "cache-control": "max-age=60" } });
    },
  });
  const reused = await conditional.search({ ticker: "ACME", projectName: "Atlas" });
  assert.equal(conditionalCalls, 2);
  assert.equal(reused.candidates.length, 1);
});

test("honors Retry-After conservatively", async () => {
  let time = Date.parse("2026-02-02T00:00:00Z");
  const waits = [];
  let calls = 0;
  const connector = createSecConnector({
    userAgent: "SafeLoc tests sec@example.com",
    clock: () => time,
    sleep: async (ms) => { waits.push(ms); time += ms; },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("", { status: 429, headers: { "retry-after": "2" } });
      return json(calls === 2 ? directory : submissions);
    },
  });
  await connector.search({ ticker: "ACME", projectName: "Atlas" });
  assert.ok(waits.includes(2_000));
  assert.equal(parseRetryAfter("0", time), 1_000);
});

test("rejects credential concepts and malformed SEC responses", async () => {
  assert.throws(
    () => createSecConnector({ userAgent: "SafeLoc sec@example.com", apiKey: "not-allowed" }),
    /public data/i,
  );
  const connector = createSecConnector({
    userAgent: "SafeLoc tests sec@example.com",
    sleep: async () => {},
    fetchImpl: async () => new Response("<html>blocked</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  await assert.rejects(connector.search({ ticker: "ACME" }), /non-JSON/);
});